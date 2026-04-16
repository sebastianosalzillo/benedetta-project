'use strict';

const { buildToolResultPrompt } = require('../electron/prompt-factory');

describe('buildToolResultPrompt', () => {
  test('adds PARTIAL_SUCCESS guidance when some tools fail', () => {
    const results = [
      { type: 'read_file', ok: true, content: 'data' },
      { type: 'memory_search', ok: false, error: 'not found' },
    ];
    const prompt = buildToolResultPrompt(results);
    expect(prompt).toContain('PARTIAL_SUCCESS');
    expect(prompt).toContain('usa prima i risultati riusciti');
  });

  test('no guidance when all succeed', () => {
    const results = [
      { type: 'read_file', ok: true, content: 'data' },
      { type: 'memory_search', ok: true, results: [] },
    ];
    const prompt = buildToolResultPrompt(results);
    expect(prompt).not.toContain('PARTIAL_SUCCESS');
  });

  test('no guidance when all fail', () => {
    const results = [
      { type: 'read_file', ok: false, error: 'error1' },
      { type: 'memory_search', ok: false, error: 'error2' },
    ];
    const prompt = buildToolResultPrompt(results);
    expect(prompt).not.toContain('PARTIAL_SUCCESS');
  });
});
