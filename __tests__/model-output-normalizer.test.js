'use strict';

const { normalizeModelOutput } = require('../electron/model-output-normalizer');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseText(modelText) {
  try {
    return JSON.parse(modelText);
  } catch {
    return null;
  }
}

function speechFromPhases(json) {
  const texts = [];
  for (const phase of json?.phases ?? []) {
    for (const seg of phase?.segments ?? []) {
      if (seg?.type === 'speech') texts.push(seg.text);
    }
  }
  return texts.join(' ');
}

// ---------------------------------------------------------------------------
// Suite: suffix stripping
// ---------------------------------------------------------------------------

describe('normalizeModelOutput – suffix stripping', () => {
  test('strips (JSON_UNESCAPED_UNICODE) suffix', () => {
    const raw =
      '{"phases":[{"kind":"final","phaseId":"p1","segments":[{"type":"speech","text":"Ciao"}]}]}(JSON_UNESCAPED_UNICODE)';
    const { modelText } = normalizeModelOutput(raw);
    const json = parseText(modelText);
    expect(json).not.toBeNull();
    expect(speechFromPhases(json)).toBe('Ciao');
  });

  test('strips bare JSON_UNESCAPED_UNICODE suffix', () => {
    const raw =
      '{"phases":[{"kind":"final","phaseId":"p1","segments":[{"type":"speech","text":"Hello"}]}]}JSON_UNESCAPED_UNICODE';
    const { modelText } = normalizeModelOutput(raw);
    const json = parseText(modelText);
    expect(json).not.toBeNull();
    expect(speechFromPhases(json)).toBe('Hello');
  });

  test('strips multiple known suffixes', () => {
    const raw =
      '{"phases":[{"kind":"final","phaseId":"p1","segments":[{"type":"speech","text":"Test"}]}]}(JSON_UNESCAPED_UNICODE)(JSON_PRETTY_PRINT)';
    const { modelText } = normalizeModelOutput(raw);
    const json = parseText(modelText);
    expect(json).not.toBeNull();
    expect(speechFromPhases(json)).toBe('Test');
  });
});

// ---------------------------------------------------------------------------
// Suite: markdown fence removal
// ---------------------------------------------------------------------------

describe('normalizeModelOutput – markdown fences', () => {
  test('strips ```json … ``` fences', () => {
    const raw = '```json\n{"phases":[{"kind":"final","phaseId":"p1","segments":[{"type":"speech","text":"Ok"}]}]}\n```';
    const { modelText } = normalizeModelOutput(raw);
    const json = parseText(modelText);
    expect(json).not.toBeNull();
    expect(speechFromPhases(json)).toBe('Ok');
  });

  test('strips ``` … ``` fences without language hint', () => {
    const raw = '```\n{"phases":[{"kind":"final","phaseId":"p1","segments":[{"type":"speech","text":"Hello"}]}]}\n```';
    const { modelText } = normalizeModelOutput(raw);
    const json = parseText(modelText);
    expect(json).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: extra closing bracket repair
// ---------------------------------------------------------------------------

describe('normalizeModelOutput – extra closing bracket', () => {
  test('handles extra ] after root object', () => {
    const raw =
      '{"phases":[{"kind":"final","phaseId":"p1","segments":[{"type":"speech","text":"Ciao"}]}]}]';
    const { modelText } = normalizeModelOutput(raw);
    const json = parseText(modelText);
    expect(json).not.toBeNull();
    expect(speechFromPhases(json)).toBe('Ciao');
  });
});

// ---------------------------------------------------------------------------
// Suite: top-level segments wrapping
// ---------------------------------------------------------------------------

describe('normalizeModelOutput – top-level segments wrapping', () => {
  test('wraps {segments:[...]} into phases.final', () => {
    const raw = JSON.stringify({
      segments: [
        { type: 'avatar', emotion: 'happy', gesture: 'thumbup' },
        { type: 'speech', text: 'Great job!' },
      ],
    });
    const { modelText, wasRepaired } = normalizeModelOutput(raw);
    const json = parseText(modelText);
    expect(json).not.toBeNull();
    expect(Array.isArray(json.phases)).toBe(true);
    expect(json.phases[0].kind).toBe('final');
    expect(wasRepaired).toBe(true);
    expect(speechFromPhases(json)).toBe('Great job!');
  });
});

// ---------------------------------------------------------------------------
// Suite: avatar-only segment (no speech) – should not become text
// ---------------------------------------------------------------------------

describe('normalizeModelOutput – avatar-only phase', () => {
  test('avatar-only phase kept in JSON, not leaked to plain text', () => {
    const raw = JSON.stringify({
      phases: [
        {
          kind: 'final',
          phaseId: 'p1',
          segments: [{ type: 'avatar', emotion: 'think', gesture: 'index' }],
        },
      ],
    });
    const { modelText } = normalizeModelOutput(raw);
    // Should still be valid JSON (not downgraded to plain text)
    const json = parseText(modelText);
    expect(json).not.toBeNull();
    expect(json.phases[0].segments[0].type).toBe('avatar');
  });
});

// ---------------------------------------------------------------------------
// Suite: plain-text fallback
// ---------------------------------------------------------------------------

describe('normalizeModelOutput – plain text fallback', () => {
  test('returns clean text when no JSON present', () => {
    const raw = 'Hello! How can I help you today?';
    const { modelText, wasRepaired } = normalizeModelOutput(raw);
    expect(modelText).toBe('Hello! How can I help you today?');
    expect(wasRepaired).toBe(false);
  });

  test('strips avatar metadata lines from plain text', () => {
    const raw = 'Sure, let me think.\nemotion: think\nmotion: index\ntype: gesture\nHere is my answer.';
    const { modelText } = normalizeModelOutput(raw);
    expect(modelText).not.toMatch(/emotion\s*:/i);
    expect(modelText).not.toMatch(/motion\s*:/i);
    expect(modelText).not.toMatch(/type\s*:/i);
  });

  test('strips avatar metadata inline marker (dot-separated)', () => {
    const raw = 'emotion: happy · motion: thumbup · type: gesture\nActual answer here.';
    const { modelText } = normalizeModelOutput(raw);
    expect(modelText).not.toMatch(/emotion\s*:/i);
    expect(modelText).toContain('Actual answer here.');
  });
});

// ---------------------------------------------------------------------------
// Suite: clean valid JSON – no-op path
// ---------------------------------------------------------------------------

describe('normalizeModelOutput – clean input passthrough', () => {
  test('clean JSON passes through unchanged (modulo serialization)', () => {
    const input = {
      phases: [
        {
          kind: 'final',
          phaseId: 'p1',
          segments: [
            { type: 'avatar', emotion: 'happy', gesture: 'thumbup' },
            { type: 'speech', text: 'Ciao!' },
          ],
        },
      ],
    };
    const raw = JSON.stringify(input);
    const { modelText, wasRepaired } = normalizeModelOutput(raw);
    const json = parseText(modelText);
    expect(json).not.toBeNull();
    expect(wasRepaired).toBe(false);
    expect(speechFromPhases(json)).toBe('Ciao!');
  });

  test('preserves original raw string in result', () => {
    const raw = '{"phases":[]}(JSON_UNESCAPED_UNICODE)';
    const { originalRaw } = normalizeModelOutput(raw);
    expect(originalRaw).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// Suite: edge cases
// ---------------------------------------------------------------------------

describe('normalizeModelOutput – edge cases', () => {
  test('empty string returns empty modelText', () => {
    const { modelText } = normalizeModelOutput('');
    expect(modelText).toBe('');
  });

  test('null/undefined input does not throw', () => {
    expect(() => normalizeModelOutput(null)).not.toThrow();
    expect(() => normalizeModelOutput(undefined)).not.toThrow();
  });

  test('suffix-only string returns empty after strip', () => {
    const { modelText } = normalizeModelOutput('(JSON_UNESCAPED_UNICODE)');
    expect(modelText).toBe('');
  });

  test('text before JSON is ignored, JSON is extracted correctly', () => {
    const raw = 'Here is my response: {"phases":[{"kind":"final","phaseId":"p1","segments":[{"type":"speech","text":"Hi"}]}]}';
    const { modelText } = normalizeModelOutput(raw);
    const json = parseText(modelText);
    expect(json).not.toBeNull();
    expect(speechFromPhases(json)).toBe('Hi');
  });
});
