const path = require('path');
const fs = require('fs');
const os = require('os');

describe('file-tool path guard', () => {
  let tempRoot;
  let originalRoot;
  let fileTool;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'file-tool-'));
    originalRoot = process.env.NYX_FILE_TOOL_ROOT;
    process.env.NYX_FILE_TOOL_ROOT = tempRoot;
    jest.resetModules();
    fileTool = require('../electron/file-tool');
  });

  afterEach(() => {
    if (originalRoot === undefined) delete process.env.NYX_FILE_TOOL_ROOT;
    else process.env.NYX_FILE_TOOL_ROOT = originalRoot;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('writes inside the configured root', () => {
    const result = fileTool.writeTextFile('notes/test.txt', 'ok');
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(tempRoot, 'notes', 'test.txt'))).toBe(true);
  });

  test('blocks traversal outside the configured root', () => {
    const result = fileTool.writeTextFile('../escape.txt', 'nope');
    expect(result).toEqual({
      ok: false,
      error: 'Path fuori dal root consentito del file tool.',
    });
  });
});
