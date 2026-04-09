const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  resolveWorkspacePath,
  resolveWorkspaceRequestPath,
  runMemoryGet,
  truncatePromptText,
  truncateWithMarker,
} = require('../electron/workspace-manager');

describe('workspace-manager path resolution', () => {
  let tempRoot;
  let app;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-manager-'));
    app = {
      getPath: jest.fn(() => tempRoot),
    };
    fs.mkdirSync(path.join(tempRoot, 'workspace'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('resolveWorkspacePath returns a safe path inside workspace root', () => {
    const result = resolveWorkspacePath(app, 'memory/2026-04-03.md');

    expect(result.resolved).toBe(path.join(tempRoot, 'workspace', 'memory', '2026-04-03.md'));
    expect(result.workspaceRoot).toBe(path.join(tempRoot, 'workspace'));
  });

  test('resolveWorkspaceRequestPath blocks traversal outside workspace', () => {
    expect(resolveWorkspaceRequestPath(app, '../secrets.txt')).toBeNull();
  });

  test('runMemoryGet reads a bounded excerpt from a workspace file', () => {
    const targetPath = path.join(tempRoot, 'workspace', 'memory', 'today.md');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, 'one\ntwo\nthree\nfour\nfive', 'utf8');

    const result = runMemoryGet(app, 'memory/today.md', 2, 2);

    expect(result).toEqual({
      ok: true,
      path: 'memory/today.md',
      startLine: 2,
      endLine: 3,
      text: 'two\nthree',
    });
  });

  test('runMemoryGet rejects paths outside workspace', () => {
    expect(runMemoryGet(app, '../secret.txt')).toEqual({
      ok: false,
      error: 'Path fuori dal workspace.',
    });
  });

  test('truncateWithMarker preserves short text', () => {
    expect(truncateWithMarker('abc', 10)).toBe('abc');
  });

  test('truncateWithMarker applies the shared truncation marker for tiny limits', () => {
    expect(truncateWithMarker('abcdefghijklmnopqrstuvwxyz', 12)).toBe('\n\n[TRUNCATED]');
  });

  test('truncatePromptText delegates to the shared truncation helper', () => {
    expect(truncatePromptText('abcdefghijklmnopqrstuvwxyz', 12)).toBe('\n\n[TRUNCATED]');
  });
});
