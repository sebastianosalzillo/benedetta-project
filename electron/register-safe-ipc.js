const {
  registerValidatedIpcHandler,
  registerValidatedIpcListener,
} = require('./security');
const {
  sendAvatarSpeak,
  sendAvatarStop,
  sendAvatarSetMood,
  sendAvatarPlayMotion,
  sendAvatarCommandLegacy,
} = require('./avatar-commands');

function registerSafeIpcHandlers(ipcMain, deps) {
  const {
    getAppStatePayload,
    setSelectedBrain,
    setOllamaConfig,
    testBrainSelection,
    openWorkspaceFolder,
    completeWorkspaceBootstrap,
    runShellCommand,
    stopShellProcess,
    listShellProcesses,
    readFileTool,
    writeFileTool,
    editFileTool,
    deleteFileTool,
    listDirectory,
    globFiles,
    grepFiles,
    readManyFiles,
    gitHandleAction,
    webFetch,
    webSearch,
    handleTaskAction,
    getTaskSummary,
    detectFrustration,
    getCircuitBreakerStatus,
    resetCircuitBreaker,
    getDreamStatus,
    getPersonalityState,
    getPersonalityPrompt,
    getPromptStats,
    getChatHistory,
    setWindowAlwaysOnTop,
    readClipboardText,
    writeClipboardText,
    getAvatarWindow,
    handleAvatarPlaybackInternal,
    resolvePlaybackWaiter,
    makePlaybackKey,
    activeResponseId,
  } = deps;

  // ─── Avatar typed IPC channels ────────────────────────────────────────────
  // Each channel validates its input before forwarding to the avatar window.
  registerValidatedIpcHandler(ipcMain, 'avatar:speak', async (_event, payload) =>
    sendAvatarSpeak(getAvatarWindow, payload || {})
  );
  registerValidatedIpcHandler(ipcMain, 'avatar:stop', async () =>
    sendAvatarStop(getAvatarWindow)
  );
  registerValidatedIpcHandler(ipcMain, 'avatar:set-mood', async (_event, payload) =>
    sendAvatarSetMood(getAvatarWindow, payload || {})
  );
  registerValidatedIpcHandler(ipcMain, 'avatar:play-motion', async (_event, payload) =>
    sendAvatarPlayMotion(getAvatarWindow, payload || {})
  );

  // Legacy generic command channel — validates command name before forwarding.
  // During migration, internal callers still use sendAvatarCommand().
  registerValidatedIpcHandler(ipcMain, 'avatar:command', async (_event, command) =>
    sendAvatarCommandLegacy(getAvatarWindow, command || {})
  );

  // Playback notification — renderer → main
  registerValidatedIpcListener(ipcMain, 'avatar:playback', (_event, payload) =>
    handleAvatarPlaybackInternal(resolvePlaybackWaiter, makePlaybackKey, activeResponseId, payload)
  );

  registerValidatedIpcHandler(ipcMain, 'app:get-state', async () => getAppStatePayload());
  registerValidatedIpcHandler(ipcMain, 'brain:set-selected', async (_event, brainId) => setSelectedBrain(brainId));
  registerValidatedIpcHandler(ipcMain, 'brain:set-ollama-config', async (_event, config) => setOllamaConfig(config || {}));
  registerValidatedIpcHandler(ipcMain, 'brain:test', async (_event, brainId) => testBrainSelection(brainId));
  registerValidatedIpcHandler(ipcMain, 'workspace:open-folder', async () => openWorkspaceFolder());
  registerValidatedIpcHandler(ipcMain, 'workspace:complete-bootstrap', async () => completeWorkspaceBootstrap());

  registerValidatedIpcHandler(ipcMain, 'shell:run', async (_event, command, options = {}) => runShellCommand(command, options));
  registerValidatedIpcHandler(ipcMain, 'shell:stop', async (_event, processId) => stopShellProcess(processId));
  registerValidatedIpcHandler(ipcMain, 'shell:list', async () => listShellProcesses());

  registerValidatedIpcHandler(ipcMain, 'file:read', async (_event, filePath, options = {}) => readFileTool(filePath, options));
  registerValidatedIpcHandler(ipcMain, 'file:write', async (_event, filePath, content, options = {}) => writeFileTool(filePath, content, options));
  registerValidatedIpcHandler(ipcMain, 'file:edit', async (_event, filePath, options = {}) => editFileTool(filePath, options));
  registerValidatedIpcHandler(ipcMain, 'file:delete', async (_event, filePath) => deleteFileTool(filePath));
  registerValidatedIpcHandler(ipcMain, 'file:list', async (_event, dirPath) => listDirectory(dirPath));

  registerValidatedIpcHandler(ipcMain, 'search:glob', async (_event, pattern, searchPath = '.') => globFiles(pattern, searchPath));
  registerValidatedIpcHandler(ipcMain, 'search:grep', async (_event, pattern, searchPath = '.', options = {}) => grepFiles(pattern, searchPath, options));
  registerValidatedIpcHandler(ipcMain, 'search:multi-read', async (_event, filePaths, options = {}) => readManyFiles(filePaths, options));

  registerValidatedIpcHandler(ipcMain, 'git:run', async (_event, action, params = {}, cwd = '.') => gitHandleAction(action, params, cwd));

  registerValidatedIpcHandler(ipcMain, 'web:fetch', async (_event, url, options = {}) => webFetch(url, options));
  registerValidatedIpcHandler(ipcMain, 'web:search', async (_event, query, options = {}) => webSearch(query, options));

  registerValidatedIpcHandler(ipcMain, 'task:run', async (_event, action, params = {}) => handleTaskAction(action, params));
  registerValidatedIpcHandler(ipcMain, 'task:summary', async () => ({ ok: true, summary: getTaskSummary() }));
  registerValidatedIpcHandler(ipcMain, 'frustration:detect', async (_event, text) => detectFrustration(text));
  registerValidatedIpcHandler(ipcMain, 'circuit-breaker:status', async () => ({ ok: true, status: getCircuitBreakerStatus() }));
  registerValidatedIpcHandler(ipcMain, 'circuit-breaker:reset', async () => resetCircuitBreaker());
  registerValidatedIpcHandler(ipcMain, 'dream:status', async () => ({ ok: true, status: getDreamStatus() }));
  registerValidatedIpcHandler(ipcMain, 'personality:get', async () => ({ ok: true, personality: getPersonalityState() }));
  registerValidatedIpcHandler(ipcMain, 'personality:prompt', async () => ({ ok: true, prompt: getPersonalityPrompt() }));
  registerValidatedIpcHandler(ipcMain, 'prompt:stats', async () => ({ ok: true, stats: getPromptStats() }));
  registerValidatedIpcHandler(ipcMain, 'chat:get-history', async () => ({ ok: true, messages: getChatHistory() }));

  registerValidatedIpcHandler(ipcMain, 'window:set-always-on-top', async (_event, target, enabled) => setWindowAlwaysOnTop(target, enabled));
  registerValidatedIpcHandler(ipcMain, 'clipboard:read-text', async () => ({ ok: true, text: readClipboardText() || '' }));
  registerValidatedIpcHandler(ipcMain, 'clipboard:write-text', async (_event, text) => writeClipboardText(text));
}

module.exports = {
  registerSafeIpcHandlers,
};
