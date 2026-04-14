const {
  registerValidatedIpcHandler,
  registerValidatedIpcListener,
  assertChatScreenSender,
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
  registerValidatedIpcHandler(ipcMain, 'brain:set-selected', async (event, brainId) => { assertChatScreenSender(event, 'brain:set-selected'); return setSelectedBrain(brainId); });
  registerValidatedIpcHandler(ipcMain, 'brain:set-ollama-config', async (event, config) => { assertChatScreenSender(event, 'brain:set-ollama-config'); return setOllamaConfig(config || {}); });
  registerValidatedIpcHandler(ipcMain, 'brain:test', async (event, brainId) => { assertChatScreenSender(event, 'brain:test'); return testBrainSelection(brainId); });
  registerValidatedIpcHandler(ipcMain, 'workspace:open-folder', async (event) => { assertChatScreenSender(event, 'workspace:open-folder'); return openWorkspaceFolder(); });
  registerValidatedIpcHandler(ipcMain, 'workspace:complete-bootstrap', async (event) => { assertChatScreenSender(event, 'workspace:complete-bootstrap'); return completeWorkspaceBootstrap(); });

  registerValidatedIpcHandler(ipcMain, 'shell:run', async (event, command, options = {}) => { assertChatScreenSender(event, 'shell:run'); return runShellCommand(command, options); });
  registerValidatedIpcHandler(ipcMain, 'shell:stop', async (event, processId) => { assertChatScreenSender(event, 'shell:stop'); return stopShellProcess(processId); });
  registerValidatedIpcHandler(ipcMain, 'shell:list', async (event) => { assertChatScreenSender(event, 'shell:list'); return listShellProcesses(); });

  registerValidatedIpcHandler(ipcMain, 'file:read', async (event, filePath, options = {}) => { assertChatScreenSender(event, 'file:read'); return readFileTool(filePath, options); });
  registerValidatedIpcHandler(ipcMain, 'file:write', async (event, filePath, content, options = {}) => { assertChatScreenSender(event, 'file:write'); return writeFileTool(filePath, content, options); });
  registerValidatedIpcHandler(ipcMain, 'file:edit', async (event, filePath, options = {}) => { assertChatScreenSender(event, 'file:edit'); return editFileTool(filePath, options); });
  registerValidatedIpcHandler(ipcMain, 'file:delete', async (event, filePath) => { assertChatScreenSender(event, 'file:delete'); return deleteFileTool(filePath); });
  registerValidatedIpcHandler(ipcMain, 'file:list', async (event, dirPath) => { assertChatScreenSender(event, 'file:list'); return listDirectory(dirPath); });

  registerValidatedIpcHandler(ipcMain, 'search:glob', async (event, pattern, searchPath = '.') => { assertChatScreenSender(event, 'search:glob'); return globFiles(pattern, searchPath); });
  registerValidatedIpcHandler(ipcMain, 'search:grep', async (event, pattern, searchPath = '.', options = {}) => { assertChatScreenSender(event, 'search:grep'); return grepFiles(pattern, searchPath, options); });
  registerValidatedIpcHandler(ipcMain, 'search:multi-read', async (event, filePaths, options = {}) => { assertChatScreenSender(event, 'search:multi-read'); return readManyFiles(filePaths, options); });

  registerValidatedIpcHandler(ipcMain, 'git:run', async (event, action, params = {}, cwd = '.') => { assertChatScreenSender(event, 'git:run'); return gitHandleAction(action, params, cwd); });

  registerValidatedIpcHandler(ipcMain, 'web:fetch', async (event, url, options = {}) => { assertChatScreenSender(event, 'web:fetch'); return webFetch(url, options); });
  registerValidatedIpcHandler(ipcMain, 'web:search', async (event, query, options = {}) => { assertChatScreenSender(event, 'web:search'); return webSearch(query, options); });

  registerValidatedIpcHandler(ipcMain, 'task:run', async (event, action, params = {}) => { assertChatScreenSender(event, 'task:run'); return handleTaskAction(action, params); });
  registerValidatedIpcHandler(ipcMain, 'task:summary', async (event) => { assertChatScreenSender(event, 'task:summary'); return ({ ok: true, summary: getTaskSummary() }); });
  registerValidatedIpcHandler(ipcMain, 'frustration:detect', async (event, text) => { assertChatScreenSender(event, 'frustration:detect'); return detectFrustration(text); });
  registerValidatedIpcHandler(ipcMain, 'circuit-breaker:status', async (event) => { assertChatScreenSender(event, 'circuit-breaker:status'); return ({ ok: true, status: getCircuitBreakerStatus() }); });
  registerValidatedIpcHandler(ipcMain, 'circuit-breaker:reset', async (event) => { assertChatScreenSender(event, 'circuit-breaker:reset'); return resetCircuitBreaker(); });
  registerValidatedIpcHandler(ipcMain, 'dream:status', async (event) => { assertChatScreenSender(event, 'dream:status'); return ({ ok: true, status: getDreamStatus() }); });
  registerValidatedIpcHandler(ipcMain, 'personality:get', async (event) => { assertChatScreenSender(event, 'personality:get'); return ({ ok: true, personality: getPersonalityState() }); });
  registerValidatedIpcHandler(ipcMain, 'personality:prompt', async (event) => { assertChatScreenSender(event, 'personality:prompt'); return ({ ok: true, prompt: getPersonalityPrompt() }); });
  registerValidatedIpcHandler(ipcMain, 'prompt:stats', async (event) => { assertChatScreenSender(event, 'prompt:stats'); return ({ ok: true, stats: getPromptStats() }); });
  registerValidatedIpcHandler(ipcMain, 'chat:get-history', async (event) => { assertChatScreenSender(event, 'chat:get-history'); return ({ ok: true, messages: getChatHistory() }); });

  registerValidatedIpcHandler(ipcMain, 'window:set-always-on-top', async (_event, target, enabled) => setWindowAlwaysOnTop(target, enabled));
  registerValidatedIpcHandler(ipcMain, 'clipboard:read-text', async () => ({ ok: true, text: readClipboardText() || '' }));
  registerValidatedIpcHandler(ipcMain, 'clipboard:write-text', async (_event, text) => writeClipboardText(text));
}

module.exports = {
  registerSafeIpcHandlers,
};
