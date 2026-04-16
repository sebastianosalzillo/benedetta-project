const path = require('path');
const fs = require('fs');
const {
  getWorkspacePath,
  getWorkspaceFilePath,
  getWorkspaceDailyMemoryPath,
  listRecentDailyMemoryNotes,
} = require('./workspace-manager');

const {
  readTextFile: readFileTool,
  writeTextFile: writeFileTool,
  editFile: editFileTool,
  deleteFile: deleteFileTool,
} = require('./file-tool');
const { globFiles, grepFiles } = require('./search-tool');
const { webFetch, webSearch } = require('./web-tool');
const { runShellCommand } = require('./shell-tool');
const { applyPatchText } = require('./apply-patch');
const { gitHandleAction } = require('./git-tool');
const { handleTaskAction: taskActionHandler } = require('./task-tool');
const { readManyFiles } = require('./search-tool');
const {
  sanitizeFileOutput,
  sanitizeGenericOutput,
  sanitizeWebOutput,
} = require('./middleware/output-sanitizer');
const { logToolExecution } = require('./debug-logger');

const DEFAULT_WORKSPACE_FILES = ['IDENTITY.md', 'SOUL.md', 'AGENTS.md', 'TOOLS.md', 'USER.md', 'MEMORY.md', 'PERSONALITY.md'];
const DEFAULT_MUTABLE_FILES = ['BOOT.md', 'BOOTSTRAP.md', 'DREAMS.md'];

const TOOL_EXECUTION_CONTEXT = {
  workspaceFileNames: [...DEFAULT_WORKSPACE_FILES, ...DEFAULT_MUTABLE_FILES, 'memory.md'],
};

function createToolExecutor(context) {
  const {
    app,
    getActiveResponseId = () => null,
    getWorkspaceState = () => ({}),
  } = context;

  async function executeReadFile(call) {
    const fp = String(call.directive.path || '');
    if (!fp) return { type: 'read_file', ok: false, error: 'No path specified' };

    const isWorkspaceFile = TOOL_EXECUTION_CONTEXT.workspaceFileNames.includes(path.basename(fp)) || fp.startsWith('memory/');
    let r;

    if (isWorkspaceFile) {
      const wsResolved = path.resolve(getWorkspacePath(app), fp);
      if (wsResolved.startsWith(getWorkspacePath(app)) && fs.existsSync(wsResolved)) {
        try {
          const raw = fs.readFileSync(wsResolved, 'utf-8');
          const lines = raw.split(/\r?\n/);
          const start = Math.max(0, (call.directive.startLine || 1) - 1);
          const end = call.directive.endLine ? Math.min(call.directive.endLine, lines.length) : Math.min(start + 2000, lines.length);
          r = { ok: true, content: lines.slice(start, end).join('\n'), path: wsResolved };
        } catch (wsErr) {
          r = { ok: false, error: `Workspace file read error: ${wsErr.message}` };
        }
      } else {
        r = readFileTool(fp, { startLine: call.directive.startLine, endLine: call.directive.endLine });
      }
    } else {
      r = readFileTool(fp, { startLine: call.directive.startLine, endLine: call.directive.endLine });
    }

    logToolExecution({ type: 'read_file', path: fp }, { ok: r.ok, error: r.error }, getActiveResponseId());
    return { type: 'read_file', ok: r.ok, content: r.ok ? sanitizeFileOutput(r.content) : sanitizeGenericOutput(r.error), path: fp, error: r.ok ? null : r.error };
  }

  function executeGlob(call) {
    const p = String(call.directive.pattern || '');
    if (!p) return { type: 'glob', ok: false, error: 'No pattern specified' };
    let searchPath = call.directive.path || '.';
    if (searchPath === '.' || searchPath === '' || p.includes('memory') || p.includes('USER') || p.includes('SOUL')) {
      searchPath = getWorkspacePath(app);
    }
    const r = globFiles(p, searchPath);
    return { type: 'glob', ok: r.ok, files: r.ok ? r.files.map((f) => f.relativePath || f.path) : [], error: r.ok ? null : r.error };
  }

  function executeGrep(call) {
    const p = String(call.directive.pattern || '');
    if (!p) return { type: 'grep', ok: false, error: 'No pattern specified' };
    let searchPath = call.directive.path || '.';
    if (searchPath === '.' || searchPath === '' || p.includes('memory') || p.includes('USER') || p.includes('SOUL')) {
      searchPath = getWorkspacePath(app);
    }
    const r = grepFiles(p, searchPath, { include: call.directive.include, maxResults: 50 });
    return { type: 'grep', ok: r.ok, matches: r.ok ? r.results.map((m) => `${m.relativePath}:${m.line}: ${sanitizeGenericOutput(m.text)}`) : [], error: r.ok ? null : r.error };
  }

  async function executeWebFetch(call) {
    const url = String(call.directive.url || '');
    if (!url) return { type: 'web_fetch', ok: false, error: 'No URL specified' };
    const r = await webFetch(url, { format: call.directive.format || 'markdown' });
    return { type: 'web_fetch', ok: r.ok, content: r.ok ? sanitizeWebOutput(r.content) : sanitizeGenericOutput(r.error), url, error: r.ok ? null : r.error };
  }

  async function executeWebSearch(call) {
    const q = String(call.directive.query || '');
    if (!q) return { type: 'web_search', ok: false, error: 'No query specified' };
    const r = await webSearch(q, { numResults: call.directive.numResults || 5 });
    return { type: 'web_search', ok: r.ok, results: r.ok ? sanitizeGenericOutput(r.results.map((s) => `${s.title} - ${s.url}`).join('\n')) : sanitizeGenericOutput(r.error), query: q, error: r.ok ? null : r.error };
  }

  function executeMemorySearch(call) {
    const query = String(call.directive.query || '');
    if (!query) return { type: 'memory_search', ok: false, error: 'No query specified' };
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const queryRegex = new RegExp(escapedQuery, 'i');
    const scope = String(call.directive.scope || 'all');
    const memoryResults = [];

    const filesToSearch = [];
    if (scope === 'all' || scope === 'memory') {
      filesToSearch.push('MEMORY.md', 'USER.md', 'IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'DREAMS.md');
    }
    if (scope === 'all' || scope === 'daily') {
      const dailyNotes = listRecentDailyMemoryNotes(10);
      filesToSearch.push(...dailyNotes.map(note => note.relativePath));
    }

    for (const fileName of filesToSearch) {
      const filePath = getWorkspaceFilePath(fileName);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (queryRegex.test(content)) {
          const lines = content.split('\n').filter((l) => queryRegex.test(l));
          const snippet = sanitizeGenericOutput(lines.slice(0, fileName.includes('memory/') ? 5 : 10).join('\n'));
          memoryResults.push({
            file: fileName,
            path: fileName,
            line: lines.findIndex(l => queryRegex.test(l)) + 1,
            snippet,
            source: fileName.startsWith('memory/') ? 'daily' : 'core'
          });
        }
      }
    }

    return { type: 'memory_search', ok: true, results: memoryResults, count: memoryResults.length };
  }

  function executeMemoryGet(call) {
    const fileName = String(call.directive.file || '');
    const line = Number(call.directive.line || 1);
    const count = Number(call.directive.count || 40);
    if (!fileName) return { type: 'memory_get', ok: false, error: 'No file specified' };

    const filePath = getWorkspaceFilePath(fileName);
    if (!fs.existsSync(filePath)) {
      return { type: 'memory_get', ok: false, error: `File not found: ${fileName}` };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, line - 1);
      const end = Math.min(lines.length, start + count);
      return { type: 'memory_get', ok: true, file: fileName, line, count, content: lines.slice(start, end).join('\n') };
    } catch (err) {
      return { type: 'memory_get', ok: false, error: err.message };
    }
  }

  function executeWriteFile(call) {
    const fp = String(call.directive.path || '');
    const content = String(call.directive.content || '');
    if (!fp) return { type: 'write_file', ok: false, error: 'No path specified' };

    const r = writeFileTool(fp, content);
    logToolExecution({ type: 'write_file', path: fp }, { ok: r.ok, error: r.error }, getActiveResponseId());
    return { type: 'write_file', ok: r.ok, path: fp, size: r.size, error: r.ok ? null : r.error };
  }

  function executeEditFile(call) {
    const fp = String(call.directive.path || '');
    const oldString = String(call.directive.oldString || '');
    const newString = String(call.directive.newString || '');
    const replaceAll = Boolean(call.directive.replaceAll);

    if (!fp || !oldString) return { type: 'edit_file', ok: false, error: 'Missing path or oldString' };

    const r = editFileTool(fp, { oldString, newString, replaceAll });
    logToolExecution({ type: 'edit_file', path: fp }, { ok: r.ok, error: r.error }, getActiveResponseId());
    return { type: 'edit_file', ok: r.ok, path: fp, replacements: r.replacements, error: r.ok ? null : r.error };
  }

  function executeDeleteFile(call) {
    const fp = String(call.directive.path || '');
    if (!fp) return { type: 'delete_file', ok: false, error: 'No path specified' };

    const r = deleteFileTool(fp);
    logToolExecution({ type: 'delete_file', path: fp }, { ok: r.ok, error: r.error }, getActiveResponseId());
    return { type: 'delete_file', ok: r.ok, path: fp, error: r.ok ? null : r.error };
  }

  function executeMultiFileRead(call) {
    const files = Array.isArray(call.directive.files) ? call.directive.files : [];
    if (!files.length) return { type: 'multi_file_read', ok: false, error: 'No files specified' };
    const r = readManyFiles(files);
    const mappedFiles = r.ok ? r.files.map((f) => {
      if (f.ok) return { path: f.path, ok: true, content: sanitizeFileOutput(f.content) };
      const wsResolved = path.resolve(getWorkspacePath(app), path.basename(f.path || ''));
      if (wsResolved.startsWith(getWorkspacePath(app)) && fs.existsSync(wsResolved)) {
        try {
          const raw = fs.readFileSync(wsResolved, 'utf-8');
          return { path: wsResolved, ok: true, content: sanitizeFileOutput(raw.split(/\r?\n/).slice(0, 2000).join('\n')) };
        } catch (_) {}
      }
      return { path: f.path, ok: false, content: f.error };
    }) : [];
    return { type: 'multi_file_read', ok: r.ok, files: mappedFiles, error: r.ok ? null : r.error };
  }

  function executeApplyPatch(call) {
    const fp = String(call.directive.path || '');
    if (!fp) return { type: 'apply_patch', ok: false, error: 'No path specified' };
    const r = applyPatchText(fp, String(call.directive.oldText || ''), String(call.directive.newText || ''), Boolean(call.directive.replaceAll));
    return { type: 'apply_patch', ok: r.ok, path: r.ok ? r.path : fp, replacements: r.ok ? r.replacements : 0, error: r.ok ? null : r.error };
  }

  function executeGit(call) {
    const r = gitHandleAction(String(call.directive.action || 'status'), call.directive.params || {}, String(call.directive.cwd || '.'));
    return { type: 'git', ok: r.ok, output: r.ok ? sanitizeGenericOutput(r.stdout || JSON.stringify(r)) : sanitizeGenericOutput(r.error), action: call.directive.action, error: r.ok ? null : r.error };
  }

  function executeTask(call) {
    const r = taskActionHandler(String(call.directive.action || 'list'), call.directive.params || {});
    const rawOutput = r.ok ? JSON.stringify(r.task || r.tasks || r.summary || r) : r.error;
    return { type: 'task', ok: r.ok, output: sanitizeGenericOutput(rawOutput), error: r.ok ? null : r.error };
  }

  async function executeShell(call) {
    const cmd = String(call.directive.command || '');
    if (!cmd) return { type: 'shell', ok: false, error: 'No command specified' };
    const r = await runShellCommand(cmd, { cwd: call.directive.cwd, timeout: call.directive.timeout || 30000 });
    return { type: 'shell', ok: r.ok, output: r.ok ? r.stdout : `${r.error}\n${r.stderr || ''}`, command: r.command, error: r.ok ? null : (r.error || r.stderr || 'shell error') };
  }

  async function execute(call) {
    if (!call || !call.type || !call.directive) {
      return { type: call?.type || 'unknown', ok: false, error: 'Tool call missing type or directive' };
    }

    switch (call.type) {
      case 'read_file': return executeReadFile(call);
      case 'glob': return executeGlob(call);
      case 'grep': return executeGrep(call);
      case 'web_fetch': return executeWebFetch(call);
      case 'web_search': return executeWebSearch(call);
      case 'memory_search': return executeMemorySearch(call);
      case 'memory_get': return executeMemoryGet(call);
      case 'write_file': return executeWriteFile(call);
      case 'edit_file': return executeEditFile(call);
      case 'delete_file': return executeDeleteFile(call);
      case 'multi_file_read': return executeMultiFileRead(call);
      case 'apply_patch': return executeApplyPatch(call);
      case 'git': return executeGit(call);
      case 'task': return executeTask(call);
      case 'shell': return await executeShell(call);
      default: return { type: call.type, ok: false, error: `Unknown tool type: ${call.type}` };
    }
  }

  return { execute };
}

module.exports = { createToolExecutor };
