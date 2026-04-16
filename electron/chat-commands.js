const path = require('path');
const fs = require('fs');
const {
  getWorkspacePath,
  getWorkspaceFilePath,
  getWorkspaceDailyMemoryPath,
  writeTextFile,
  readTextFile,
  runMemorySearch,
  runMemoryGet,
  runSessionSearch,
  WORKSPACE_FILE_MAX_CHARS,
  MEMORY_SEARCH_MAX_RESULTS,
  SESSION_SEARCH_MAX_RESULTS,
} = require('./workspace-manager');

/**
 * Chat commands module - single source of truth for all /commands
 * Replaces duplicate implementations in main.js and workspace-manager.js
 */

function createSystemMessage(text) {
  return {
    id: `sys-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role: 'system',
    text: String(text || ''),
    ts: new Date().toISOString(),
  };
}

function buildConversationSummary(messages) {
  if (!messages?.length) return '';
  const userMsgs = messages.filter((m) => m.role === 'user').slice(-5).map((m) => m.text).join(' | ');
  const aiMsgs = messages.filter((m) => m.role === 'assistant').slice(-3).map((m) => m.text).join(' | ');
  return `User: ${userMsgs.slice(0, 200)} | AI: ${aiMsgs.slice(0, 200)}`.slice(0, 280);
}

function createChatCommands(context) {
  const {
    app,
    getBootstrapState = () => ({}),
    getWorkspaceState = () => ({}),
    getChatSession = () => ({}),
    getChatHistory = () => [],
    getAgentSession = () => ({}),
    completeWorkspaceBootstrapFn = () => ({ message: '' }),
    openWorkspaceFolderFn = async () => ({ message: '' }),
    appendSessionFlushFn = () => null,
    compactCurrentSessionHistoryFn = () => ({ ok: false, error: 'Not configured' }),
    startFreshSessionFn = () => {},
    resetAgentSessionFn = () => {},
  } = context;

  /**
   * Execute a chat command
   * @param {string} text - Command text
   * @returns {Object|null} - Command result or null if not a command
   */
  function execute(text) {
    const rawInput = String(text || '').trim();
    const input = rawInput.toLowerCase();

    const bootstrapState = typeof getBootstrapState === 'function' ? getBootstrapState() : {};
    const workspaceState = typeof getWorkspaceState === 'function' ? getWorkspaceState() : {};
    const chatSession = typeof getChatSession === 'function' ? getChatSession() : {};
    const chatHistory = typeof getChatHistory === 'function' ? getChatHistory() : [];
    const agentSession = typeof getAgentSession === 'function' ? getAgentSession() : {};

    // Bootstrap commands
    if (input === '/bootstrap done') {
      const result = typeof completeWorkspaceBootstrapFn === 'function' ? completeWorkspaceBootstrapFn(app) : { message: 'Not configured' };
      return { message: createSystemMessage(result.message || 'Bootstrap completed'), replaceHistory: false };
    }

    if (input === '/bootstrap status') {
      const currentQuestion = bootstrapState.active ? String(bootstrapState.currentPrompt || '').trim() : '';
      const lines = [
        `Bootstrap active: ${bootstrapState.active ? 'yes' : 'no'}`,
        `Bootstrap pending: ${workspaceState.bootstrapPending ? 'yes' : 'no'}`,
        `Round: ${Number(bootstrapState.stepIndex || 0)}`,
      ];
      if (currentQuestion) lines.push(`Current question: ${currentQuestion}`);
      return { message: createSystemMessage(lines.join('\n')), replaceHistory: false };
    }

    if (input === '/bootstrap') {
      const workspacePath = getWorkspacePath(app);
      const removed = [];
      fs.mkdirSync(workspacePath, { recursive: true });
      for (const entry of fs.readdirSync(workspacePath, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
        fs.unlinkSync(path.join(workspacePath, entry.name));
        removed.push(entry.name);
      }
      const bootstrapPath = getWorkspaceFilePath(app, 'BOOTSTRAP.md');
      writeTextFile(bootstrapPath, '# BOOTSTRAP\n\nRestart initial setup.', WORKSPACE_FILE_MAX_CHARS);
      const suffix = removed.length ? ` Reset workspace files: ${removed.join(', ')}.` : '';
      return { message: createSystemMessage(`Bootstrap started from zero.${suffix} Next response will launch the wizard.`), replaceHistory: false };
    }

    // Workspace commands
    if (input === '/workspace open') {
      if (typeof openWorkspaceFolderFn === 'function') {
        openWorkspaceFolderFn(app).catch(() => {});
      }
      return { message: createSystemMessage('Workspace opened.'), replaceHistory: false };
    }

    if (input === '/workspace status') {
      const fileSummary = (workspaceState.files || []).filter((f) => f.exists).map((f) => f.name).join(', ');
      const lines = [
        `Workspace: ${workspaceState.path || 'unknown'}`,
        `Bootstrap pending: ${workspaceState.bootstrapPending ? 'yes' : 'no'}`,
        `Session: ${chatSession.id || 'none'}`,
        `Messages: ${chatHistory.length}`,
        `Files: ${fileSummary || 'none'}`,
      ];
      return { message: createSystemMessage(lines.join('\n')), replaceHistory: false };
    }

    // Memory commands
    if (input === '/memory flush') {
      const relevantMessages = chatHistory.filter((m) => m?.text);
      let flushedPath = null;
      if (relevantMessages.length && typeof appendSessionFlushFn === 'function') {
        flushedPath = appendSessionFlushFn(relevantMessages, 'manual-flush');
      }
      return {
        message: createSystemMessage(flushedPath ? `Session saved to ${path.relative(getWorkspacePath(app), flushedPath).replace(/\\/g, '/')}.` : 'No useful content to save.'),
        replaceHistory: false,
      };
    }

    if (input.startsWith('/memory search ')) {
      const query = rawInput.slice('/memory search '.length).trim();
      const results = runMemorySearch(app, query, { maxResults: MEMORY_SEARCH_MAX_RESULTS });
      return {
        message: createSystemMessage(results.length ? `Memory search:\n${results.map((item, i) => `${i + 1}. ${item.path}\n${item.snippet}`).join('\n\n')}` : 'No results.'),
        replaceHistory: false,
      };
    }

    if (input.startsWith('/memory get ')) {
      const args = rawInput.slice('/memory get '.length).trim().split(/\s+/);
      const result = runMemoryGet(app, args[0] || '', args[1] || 1, args[2] || 40);
      return {
        message: createSystemMessage(result.ok ? `${result.path}:${result.startLine}-${result.endLine}\n${result.text || '[empty]'}` : result.error),
        replaceHistory: false,
      };
    }

    // Session commands
    if (input === '/session status') {
      const lines = [
        `Session: ${chatSession.id || 'none'}`,
        `Created: ${chatSession.createdAt || '-'}`,
        `Last used: ${chatSession.lastUsedAt || '-'}`,
        `Messages: ${chatHistory.length}`,
        `Compactions: ${Number(chatSession.compactionCount || 0)}`,
        `Agent session: ${agentSession.id || 'none'}`,
      ];
      return { message: createSystemMessage(lines.join('\n')), replaceHistory: false };
    }

    if (input.startsWith('/session search ')) {
      const query = rawInput.slice('/session search '.length).trim();
      const results = runSessionSearch(app, query, { maxResults: SESSION_SEARCH_MAX_RESULTS });
      return {
        message: createSystemMessage(results.length ? `Session search:\n${results.map((item, i) => `${i + 1}. ${item.id} (${item.updatedAt || 'n/a'})\n${item.snippet}`).join('\n\n')}` : 'No results.'),
        replaceHistory: false,
      };
    }

    // Utility commands
    if (input === '/compact') {
      const result = typeof compactCurrentSessionHistoryFn === 'function' ? compactCurrentSessionHistoryFn(app, chatHistory, chatSession) : { ok: false, error: 'Not configured' };
      return { message: createSystemMessage(result.ok ? 'Session compacted.' : result.error), replaceHistory: true };
    }

    if (input === '/new' || input === '/reset') {
      if (typeof startFreshSessionFn === 'function') {
        startFreshSessionFn(app, chatHistory, chatSession, agentSession, input === '/new' ? 'new-session' : 'reset-session');
      }
      return { message: createSystemMessage('Session reset.'), replaceHistory: true };
    }

    // Not a command
    return null;
  }

  return { execute };
}

module.exports = { createChatCommands };
