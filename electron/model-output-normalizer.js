'use strict';

/**
 * model-output-normalizer.js
 *
 * Strips known artefacts that models like MiniMax M2.5 append after valid JSON.
 * Returns a clean string safe to pass to parseInlineResponse / parsePhasePlan.
 *
 * Artefacts handled:
 *   - Markdown fences (```json … ```)
 *   - PHP-style unicode flag: (JSON_UNESCAPED_UNICODE) / JSON_UNESCAPED_UNICODE
 *   - Any trailing text after the last closing brace of the root JSON object
 *   - Extra closing bracket: {"phases":[...]}]  →  {"phases":[...]}
 *   - Top-level {segments:[...]} without a phases wrapper  →  wrapped in phases.final
 *   - Loose avatar/motion metadata lines in plain text output (emotion: X · motion: Y)
 *
 * Returns:
 *   { modelText: string, wasRepaired: boolean, originalRaw: string }
 */

// Known literal suffixes to strip (case-insensitive, may be wrapped in parens).
const KNOWN_SUFFIXES = [
  /\(JSON_UNESCAPED_UNICODE\)/gi,
  /JSON_UNESCAPED_UNICODE/gi,
  /\(JSON_PRETTY_PRINT\)/gi,
  /JSON_PRETTY_PRINT/gi,
  /\(JSON_UNESCAPED_SLASHES\)/gi,
  /JSON_UNESCAPED_SLASHES/gi,
];

// Lines that are avatar/motion metadata written outside JSON (should not be spoken).
const AVATAR_META_LINE_RE = /^(?:emotion|motion|type|expression|gesture|pose)\s*[:=].*/im;
const AVATAR_META_INLINE_RE =
  /(?:^|\n)[ \t]*(?:emotion|motion|type|expression|gesture|pose)\s*[:=][^\n]*/gi;

/**
 * Remove markdown code fences.
 */
function stripMarkdownFences(text) {
  return text
    .replace(/^```(?:json)?[ \t]*\r?\n?/im, '')
    .replace(/\r?\n?```[ \t]*$/im, '')
    .trim();
}

/**
 * Remove known literal suffixes appended by some model providers.
 */
function stripKnownSuffixes(text) {
  let out = text;
  for (const re of KNOWN_SUFFIXES) {
    out = out.replace(re, '');
  }
  return out.trim();
}

/**
 * Walk the string character-by-character to find the end of the first
 * top-level JSON object or array.  Returns the end index (exclusive) or -1.
 */
function findJsonEnd(text, startPos) {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startPos; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') { depth++; continue; }
    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Try to parse a JSON string, optionally repairing one known pattern:
 * extra closing bracket after the root object.
 *
 * Returns { json, text } on success or null on failure.
 */
function tryParse(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return { json: JSON.parse(trimmed), text: trimmed };
  } catch {
    // Try stripping a trailing ] or } that doesn't match
    const cleaned = trimmed.replace(/[}\]]+$/, '');
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace < 0) return null;
    const end = findJsonEnd(cleaned, firstBrace);
    if (end < 0) return null;
    const candidate = cleaned.slice(firstBrace, end);
    try {
      return { json: JSON.parse(candidate), text: candidate };
    } catch {
      return null;
    }
  }
}

/**
 * Repair known structural issues in the parsed JSON object:
 *
 *   1. Top-level `segments` array without `phases` wrapper
 *      → wrap in { phases: [{ kind:"final", phaseId:"p1", segments }] }
 *
 *   2. Avatar-only phase segments missing a speech segment
 *      → leave as-is (the runtime handles avatar-only phases)
 *
 * Returns the (possibly mutated) json and a wasRepaired flag.
 */
function repairJsonStructure(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { json, wasRepaired: false };
  }

  // Case 1: top-level segments without phases
  if (Array.isArray(json.segments) && !Array.isArray(json.phases)) {
    const wrapped = {
      phases: [
        {
          kind: 'final',
          phaseId: 'p1',
          segments: json.segments,
        },
      ],
    };
    return { json: wrapped, wasRepaired: true };
  }

  return { json, wasRepaired: false };
}

/**
 * Build a clean plain-text fallback when JSON extraction fails entirely.
 * Removes avatar-metadata lines so they don't end up spoken by TTS.
 */
function buildPlainTextFallback(raw) {
  let text = raw
    .replace(AVATAR_META_INLINE_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Remove any lingering JSON-like fragments that would be read aloud
  text = text.replace(/^\s*\{[\s\S]*\}\s*$/m, '').trim();

  return text;
}

/**
 * Main entry point.
 *
 * @param {string} raw - Raw string from the model (stdout / API response body).
 * @returns {{ modelText: string, wasRepaired: boolean, originalRaw: string }}
 */
function normalizeModelOutput(raw) {
  const originalRaw = String(raw || '');
  let text = originalRaw;

  // 1. Strip markdown fences
  text = stripMarkdownFences(text);

  // 2. Strip known provider suffixes before looking for JSON
  text = stripKnownSuffixes(text);

  // 3. Find the start of a JSON object/array
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const jsonStart = firstBrace < 0
    ? firstBracket
    : firstBracket < 0
      ? firstBrace
      : Math.min(firstBrace, firstBracket);

  if (jsonStart >= 0) {
    // 4. Locate the end of the root JSON block
    const jsonEnd = findJsonEnd(text, jsonStart);
    if (jsonEnd > jsonStart) {
      // There may be trailing content after the JSON (suffixes, comments)
      const jsonCandidate = text.slice(jsonStart, jsonEnd);
      const trailingRaw = text.slice(jsonEnd).trim();

      // Strip known suffixes from whatever trails the JSON too
      const trailingCleaned = stripKnownSuffixes(trailingRaw);

      // 5. Attempt parse (with repair)
      const parsed = tryParse(jsonCandidate);
      if (parsed) {
        const { json: repairedJson, wasRepaired } = repairJsonStructure(parsed.json);
        const modelText = JSON.stringify(repairedJson);

        // If there is non-empty trailing text that isn't just whitespace or
        // a bracket, log it but don't include it in modelText (it would
        // confuse the parser).
        void trailingCleaned; // available for future debug logging

        return { modelText, wasRepaired, originalRaw };
      }
    }
  }

  // 6. JSON extraction failed entirely – clean up and return as plain text.
  // Use `text` (already stripped of suffixes/fences), falling back to
  // originalRaw only when no processing happened (text was never modified).
  const plainText = buildPlainTextFallback(text);
  return { modelText: plainText, wasRepaired: false, originalRaw };
}

module.exports = { normalizeModelOutput };
