const path = require('path');
const fs = require('fs');
const os = require('os');

describe('search-tool path guard', () => {
  let tempRoot;
  let originalRoot;
  let searchTool;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'search-tool-'));
    originalRoot = process.env.NYX_FILE_TOOL_ROOT;
    process.env.NYX_FILE_TOOL_ROOT = tempRoot;
    jest.resetModules();
    searchTool = require('../electron/search-tool');
  });

  afterEach(() => {
    if (originalRoot === undefined) delete process.env.NYX_FILE_TOOL_ROOT;
    else process.env.NYX_FILE_TOOL_ROOT = originalRoot;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('reads files inside the configured root', () => {
    const targetPath = path.join(tempRoot, 'data.txt');
    fs.writeFileSync(targetPath, 'hello', 'utf8');
    const result = searchTool.readManyFiles(['data.txt']);
    expect(result.ok).toBe(true);
    expect(result.files[0].ok).toBe(true);
  });

  test('blocks traversal outside the configured root', () => {
    const result = searchTool.readManyFiles(['../secret.txt']);
    expect(result.ok).toBe(true);
    expect(result.files[0].ok).toBe(false);
    expect(result.files[0].error).toBe('Path fuori dal root consentito del search tool.');
  });
});
