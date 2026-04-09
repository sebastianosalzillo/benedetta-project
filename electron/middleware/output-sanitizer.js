/**
 * @fileoverview Output sanitizer middleware.
 * Sanitizes tool outputs before they are fed back to the LLM agent,
 * preventing prompt injection attacks and data leakage.
 *
 * Applied as an afterToolCall hook — every tool output passes through here
 * before being included in the agent's context window.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SANITIZED_OUTPUT = 12000;
const MAX_SHELL_OUTPUT = 6000;
const MAX_FILE_OUTPUT = 8000;
const MAX_WEB_OUTPUT = 10000;

/**
 * Prompt injection patterns to detect and redact.
 * Covers known attack vectors: instruction override, role play, system prompt extraction.
 */
const INJECTION_PATTERNS = [
  // Direct instruction overrides
  { pattern: /\bignore\s+(all\s+)?(previous\s+)?(instructions?|prompts?|orders?|rules?)\b/gi, replacement: '[INJECTION_REDACTED]' },
  { pattern: /\bforget\s+(all\s+)?(previous|everything|your)\s+(instructions?|prompts?|training|context|memory)\b/gi, replacement: '[INJECTION_REDACTED]' },
  { pattern: /\b(disregard|override|replace)\s+(all\s+)?(previous|your|the)\s+(instructions?|prompt|rules?|guidelines?|system\s+message)\b/gi, replacement: '[INJECTION_REDACTED]' },
  { pattern: /\b(new|updated|replacement)\s+(instructions?|prompt|rules?|system\s+message|directive)\s*:\s*/gi, replacement: '[INJECTION_REDACTED]: ' },
  { pattern: /\bfrom\s+(now\s+on|on|this\s+point)\s+(forward|onward)\b.*\b(you\s+will|you\s+must|you\s+should)\b/gi, replacement: '[INJECTION_REDACTED]' },

  // Role-playing / identity attacks
  { pattern: /\byou\s+are\s+(now\s+)?(no\s+longer\s+)?(an?\s+)?(ai|assistant|chatbot|model|bot)\b/gi, replacement: '[INJECTION_REDACTED]' },
  { pattern: /\bact\s+as\s+(if\s+)?(you\s+were\s+)?(a\s+)?(different?\s+)?(ai|model|system|person|character|role)\b/gi, replacement: '[INJECTION_REDACTED]' },
  { pattern: /\bpretend\s+(to\s+be|you\s+are)\b/gi, replacement: '[INJECTION_REDACTED]' },
  { pattern: /\bdan\s+mode\b/gi, replacement: '[INJECTION_REDACTED]' },

  // System prompt extraction
  { pattern: /\b(what\s+are\s+)?(your\s+)?(original|initial|system)\s+(prompt|instructions?|rules?|directives?|guidelines?)\b/gi, replacement: '[INJECTION_REDACTED]' },
  { pattern: /\b(repeat|show|display|output|print|echo)\s+(your\s+)?(instructions?|prompt|system\s+message|rules?|directives?)\b/gi, replacement: '[INJECTION_REDACTED]' },
  { pattern: /\b(repeat|output|print)\s+(the\s+)?(words?|text|content)\s+above\b/gi, replacement: '[INJECTION_REDACTED]' },
  { pattern: /\boutput\s+(your\s+)?(full\s+)?(conversation|context|prompt)\s+(history|above|before)\b/gi, replacement: '[INJECTION_REDACTED]' },

  // Tool abuse via output
  { pattern: /\b(execute|run|call)\s+(the?\s+)?(tool|function|command|api)\s*[:\s]+/gi, replacement: '[INJECTION_REDACTED]: ' },
  { pattern: /\b(tool|function|command)\s+result\s*:\s*\{/gi, replacement: '[INJECTION_REDACTED]: {' },
];

/**
 * PII / sensitive data patterns to mask.
 */
const PII_PATTERNS = [
  // Email addresses (partial mask)
  { pattern: /\b[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, replacement: '[EMAIL]@$1' },
  // IPv4 addresses (partial mask)
  { pattern: /\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, replacement: '$1.[MASKED]' },
  // JWT-like tokens
  { pattern: /\beyJ[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}/g, replacement: '[TOKEN_REDACTED]' },
  // AWS keys
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[AWS_KEY_REDACTED]' },
  // Generic API keys (alphanumeric strings 20+ chars)
  { pattern: /\b(?:api[_-]?key|apikey|access[_-]?token)\s*[:=]\s*[A-Za-z0-9_-]{20,}/gi, replacement: '[API_KEY_REDACTED]' },
];

/**
 * ANSI escape sequences (already stripped in some places, but ensure here).
 */
const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

// ─── Core sanitization ────────────────────────────────────────────────────────

/**
 * Strip ANSI escape sequences from text.
 * @param {string} text - Raw text input
 * @returns {string} Text with ANSI codes removed
 */
function stripAnsi(text) {
  return String(text || '').replace(ANSI_ESCAPE, '');
}

/**
 * Apply injection pattern redaction to text.
 * @param {string} text - Text to sanitize
 * @returns {string} Text with injection patterns redacted
 */
function redactInjections(text) {
  let result = text;
  for (const { pattern, replacement } of INJECTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Apply PII masking to text.
 * @param {string} text - Text to sanitize
 * @returns {string} Text with PII masked
 */
function maskPII(text) {
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Normalize whitespace and truncate.
 * @param {string} text - Text to normalize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Normalized and truncated text
 */
function normalizeAndTruncate(text, maxLength) {
  const cleaned = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}\u2026`;
}

// ─── Tool-specific sanitizers ─────────────────────────────────────────────────

/**
 * Sanitize shell command output.
 * Strips ANSI, redacts injections, masks PII, enforces length limit.
 * @param {string} output - Raw shell stdout/stderr
 * @returns {string} Sanitized output
 */
function sanitizeShellOutput(output) {
  return normalizeAndTruncate(
    maskPII(redactInjections(stripAnsi(output))),
    MAX_SHELL_OUTPUT,
  );
}

/**
 * Sanitize file read output.
 * Same pipeline as shell but with a higher length budget.
 * @param {string} content - Raw file content
 * @returns {string} Sanitized content
 */
function sanitizeFileOutput(content) {
  return normalizeAndTruncate(
    maskPII(redactInjections(String(content || ''))),
    MAX_FILE_OUTPUT,
  );
}

/**
 * Sanitize web fetch output.
 * Higher length budget but same injection/PII pipeline.
 * @param {string} content - Raw web page content
 * @returns {string} Sanitized content
 */
function sanitizeWebOutput(content) {
  return normalizeAndTruncate(
    maskPII(redactInjections(String(content || ''))),
    MAX_WEB_OUTPUT,
  );
}

/**
 * Sanitize generic tool output string.
 * @param {string} text - Raw tool output
 * @returns {string} Sanitized text
 */
function sanitizeGenericOutput(text) {
  return normalizeAndTruncate(
    maskPII(redactInjections(stripAnsi(String(text || '')))),
    MAX_SANITIZED_OUTPUT,
  );
}

// ─── Result envelope sanitizer ────────────────────────────────────────────────

/**
 * Sanitize a full tool result envelope.
 * Walks the result object and sanitizes string fields that could contain
 * injection payloads or sensitive data.
 *
 * @param {Object} toolResult - Tool result object (e.g., { ok, stdout, stderr, error, ... })
 * @param {string} toolName - Tool identifier for logging/debugging
 * @returns {Object} Sanitized tool result (new object, input not mutated)
 */
function sanitizeToolResult(toolResult, toolName = 'unknown') {
  if (!toolResult || typeof toolResult !== 'object') {
    return { ok: false, error: 'Invalid tool result format.' };
  }

  const sanitized = { ...toolResult };

  // Sanitize known output fields
  if (typeof sanitized.stdout === 'string') {
    sanitized.stdout = sanitizeShellOutput(sanitized.stdout);
  }
  if (typeof sanitized.stderr === 'string') {
    sanitized.stderr = sanitizeShellOutput(sanitized.stderr);
  }
  if (typeof sanitized.content === 'string') {
    sanitized.content = sanitizeFileOutput(sanitized.content);
  }
  if (typeof sanitized.text === 'string') {
    sanitized.text = sanitizeGenericOutput(sanitized.text);
  }
  if (typeof sanitized.output === 'string') {
    sanitized.output = sanitizeGenericOutput(sanitized.output);
  }
  if (typeof sanitized.error === 'string') {
    sanitized.error = sanitizeGenericOutput(sanitized.error);
  }
  if (typeof sanitized.message === 'string') {
    sanitized.message = sanitizeGenericOutput(sanitized.message);
  }
  if (typeof sanitized.result === 'string') {
    sanitized.result = sanitizeGenericOutput(sanitized.result);
  }

  // Sanitize arrays of results (e.g., grep matches, multi-file reads)
  if (Array.isArray(sanitized.results)) {
    sanitized.results = sanitized.results.map((item) => {
      if (typeof item === 'string') return sanitizeGenericOutput(item);
      if (typeof item === 'object' && item !== null) return sanitizeToolResult(item, `${toolName}.result`);
      return item;
    }).slice(0, 50); // Cap array length
  }
  if (Array.isArray(sanitized.files)) {
    sanitized.files = sanitized.files.map((item) => {
      if (typeof item === 'object' && item !== null) return sanitizeToolResult(item, `${toolName}.file`);
      return item;
    }).slice(0, 50);
  }
  if (Array.isArray(sanitized.items)) {
    sanitized.items = sanitized.items.map((item) => {
      if (typeof item === 'object' && item !== null) return sanitizeToolResult(item, `${toolName}.item`);
      return item;
    }).slice(0, 50);
  }

  return sanitized;
}

// ─── Middleware interface ─────────────────────────────────────────────────────

/**
 * Create an afterToolCall sanitizer middleware function.
 *
 * Usage in main.js:
 *   const { createSanitizerMiddleware } = require('./middleware/output-sanitizer');
 *   const sanitizeOutput = createSanitizerMiddleware();
 *   // After tool execution:
 *   const safeResult = sanitizeOutput(rawResult, toolName);
 *
 * @returns {function(Object, string): Object} Sanitizer function
 */
function createSanitizerMiddleware() {
  return sanitizeToolResult;
}

module.exports = {
  // Core sanitization functions
  stripAnsi,
  redactInjections,
  maskPII,
  normalizeAndTruncate,

  // Tool-specific sanitizers
  sanitizeShellOutput,
  sanitizeFileOutput,
  sanitizeWebOutput,
  sanitizeGenericOutput,

  // Envelope sanitizer
  sanitizeToolResult,
  createSanitizerMiddleware,

  // Constants (for tuning)
  MAX_SANITIZED_OUTPUT,
  MAX_SHELL_OUTPUT,
  MAX_FILE_OUTPUT,
  MAX_WEB_OUTPUT,
  INJECTION_PATTERNS,
  PII_PATTERNS,
};
