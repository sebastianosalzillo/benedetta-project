const { contextBridge, ipcRenderer } = require('electron');

/**
 * Generic unsubscribe callback returned by event subscriptions.
 * @callback Unsubscribe
 * @returns {void}
 */

/**
 * Callback invoked when an IPC subscription receives new data.
 * @template T
 * @callback SubscriptionCallback
 * @param {T} payload
 * @returns {void}
 */

/**
 * Generic invoke-style IPC result.
 * @typedef {Promise<any>} IpcInvokeResult
 */

/**
 * Public preload bridge exposed to renderer processes.
 * This is the stable contract that React screens should consume instead of direct Electron APIs.
 *
 * @typedef {Object} ElectronAPI
 * @property {(text: string) => IpcInvokeResult} sendChatMessage Send a chat message to the main process.
 * @property {() => IpcInvokeResult} stopChatMessage Stop the active chat generation.
 * @property {(payload: Object) => void} sendAvatarSpeak Send a speak command with validated payload.
 * @property {() => IpcInvokeResult} sendAvatarStop Send a stop command.
 * @property {(payload: Object) => void} sendAvatarSetMood Send a mood/expression command.
 * @property {(payload: Object) => void} sendAvatarPlayMotion Send a motion/gesture command.
 * @property {(command: string) => IpcInvokeResult} sendAvatarCommand Send an avatar command to the renderer host.
 * @property {(payload: any) => void} notifyAvatarPlayback Notify playback/lipsync state changes.
 * @property {(target: string, enabled: boolean) => IpcInvokeResult} setWindowAlwaysOnTop Toggle always-on-top for avatar/chat/canvas windows.
 * @property {() => Promise<Object>} getAppState Read the aggregated application state.
 * @property {(brainId: string) => IpcInvokeResult} setSelectedBrain Select the active brain/runtime.
 * @property {(config: Object) => IpcInvokeResult} setOllamaConfig Update Ollama-specific brain configuration.
 * @property {(brainId: string) => IpcInvokeResult} testBrain Run a connectivity/health test for a brain.
 * @property {() => IpcInvokeResult} openWorkspaceFolder Open the workspace folder in the OS file manager.
 * @property {() => IpcInvokeResult} completeWorkspaceBootstrap Mark workspace bootstrap as completed.
 * @property {() => Promise<Array>} getChatHistory Read stored chat history.
 * @property {() => Promise<Object>} getCanvasState Read current canvas state.
 * @property {(payload: Object) => IpcInvokeResult} openCanvas Open the canvas with optional content/layout payload.
 * @property {(payload: Object) => IpcInvokeResult} updateCanvas Update existing canvas content/state.
 * @property {() => IpcInvokeResult} closeCanvas Close or hide the canvas window.
 * @property {(layout: string) => IpcInvokeResult} setCanvasLayout Change canvas layout mode.
 * @property {(payload: Object) => IpcInvokeResult} browserNavigate Navigate the browser tool.
 * @property {(payload?: Object) => IpcInvokeResult} browserRefresh Refresh browser state and snapshot.
 * @property {(payload: Object) => IpcInvokeResult} browserAction Execute a browser action.
 * @property {() => Promise<string>} readClipboardText Read plain text from the clipboard.
 * @property {(text: string) => IpcInvokeResult} writeClipboardText Write plain text to the clipboard.
 * @property {(callback: SubscriptionCallback<any>) => Unsubscribe} onAvatarCommand Subscribe to avatar command events.
 * @property {(callback: SubscriptionCallback<any>) => Unsubscribe} onAvatarStatus Subscribe to avatar/app status updates.
 * @property {(callback: SubscriptionCallback<any>) => Unsubscribe} onChatStream Subscribe to streaming chat events.
 * @property {(callback: SubscriptionCallback<any>) => Unsubscribe} onCanvasState Subscribe to canvas state updates.
 * @property {(command: string, options?: Object) => IpcInvokeResult} shellRun Run a shell command through the shell tool.
 * @property {(processId: string) => IpcInvokeResult} shellStop Stop a background shell process.
 * @property {() => IpcInvokeResult} shellList List tracked shell processes.
 * @property {(filePath: string, options?: Object) => IpcInvokeResult} fileRead Read a file from disk.
 * @property {(filePath: string, content: string, options?: Object) => IpcInvokeResult} fileWrite Write a file to disk.
 * @property {(filePath: string, options: Object) => IpcInvokeResult} fileEdit Edit a file with structured options.
 * @property {(filePath: string) => IpcInvokeResult} fileDelete Delete a file.
 * @property {(dirPath: string) => IpcInvokeResult} fileList List directory contents.
 * @property {(pattern: string, searchPath?: string) => IpcInvokeResult} searchGlob Run a glob search.
 * @property {(pattern: string, searchPath?: string, options?: Object) => IpcInvokeResult} searchGrep Run a grep/text search.
 * @property {(filePaths: string[], options?: Object) => IpcInvokeResult} searchMultiRead Read many files in one IPC call.
 * @property {(action: string, params?: Object, cwd?: string) => IpcInvokeResult} gitRun Run a git action through the git tool.
 * @property {(url: string, options?: Object) => IpcInvokeResult} webFetch Fetch a URL through the web tool.
 * @property {(query: string, options?: Object) => IpcInvokeResult} webSearch Search the web through the web tool.
 * @property {(action: string, params?: Object) => IpcInvokeResult} taskRun Execute a task tool action.
 * @property {() => IpcInvokeResult} taskSummary Read task summary metadata.
 * @property {(text: string) => IpcInvokeResult} frustrationDetect Run frustration detection on text.
 * @property {() => IpcInvokeResult} circuitBreakerStatus Read circuit breaker status.
 * @property {() => IpcInvokeResult} circuitBreakerReset Reset the circuit breaker.
 * @property {() => IpcInvokeResult} dreamStatus Read dream-mode status.
 * @property {() => IpcInvokeResult} personalityGet Read current personality state.
 * @property {() => IpcInvokeResult} personalityPrompt Read the generated personality prompt.
 * @property {() => IpcInvokeResult} promptStats Read prompt/token statistics.
 */

/**
 * Subscribe to an IPC event and return an unsubscribe callback.
 *
 * @template T
 * @param {string} channel
 * @param {SubscriptionCallback<T>} callback
 * @param {(data: any) => T} [mapData]
 * @returns {Unsubscribe}
 */
function subscribe(channel, callback, mapData = (data) => data) {
  const handler = (_event, data) => callback(mapData(data));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const rendererScreen = new URLSearchParams(window.location.search).get('screen') || 'chat';
const enableRendererDevTools = process.env.NYX_ENABLE_RENDERER_DEVTOOLS === '1';

const developmentOnlyBridge = (enableRendererDevTools && rendererScreen === 'chat')
  ? {
      shellRun: (command, options) => ipcRenderer.invoke('shell:run', command, options),
      shellStop: (processId) => ipcRenderer.invoke('shell:stop', processId),
      shellList: () => ipcRenderer.invoke('shell:list'),
      fileRead: (filePath, options) => ipcRenderer.invoke('file:read', filePath, options),
      fileWrite: (filePath, content, options) => ipcRenderer.invoke('file:write', filePath, content, options),
      fileEdit: (filePath, options) => ipcRenderer.invoke('file:edit', filePath, options),
      fileDelete: (filePath) => ipcRenderer.invoke('file:delete', filePath),
      fileList: (dirPath) => ipcRenderer.invoke('file:list', dirPath),
      searchGlob: (pattern, searchPath) => ipcRenderer.invoke('search:glob', pattern, searchPath),
      searchGrep: (pattern, searchPath, options) => ipcRenderer.invoke('search:grep', pattern, searchPath, options),
      searchMultiRead: (filePaths, options) => ipcRenderer.invoke('search:multi-read', filePaths, options),
      gitRun: (action, params, cwd) => ipcRenderer.invoke('git:run', action, params, cwd),
      webFetch: (url, options) => ipcRenderer.invoke('web:fetch', url, options),
      webSearch: (query, options) => ipcRenderer.invoke('web:search', query, options),
      taskRun: (action, params) => ipcRenderer.invoke('task:run', action, params),
      taskSummary: () => ipcRenderer.invoke('task:summary'),
      frustrationDetect: (text) => ipcRenderer.invoke('frustration:detect', text),
      circuitBreakerStatus: () => ipcRenderer.invoke('circuit-breaker:status'),
      circuitBreakerReset: () => ipcRenderer.invoke('circuit-breaker:reset'),
      dreamStatus: () => ipcRenderer.invoke('dream:status'),
      personalityGet: () => ipcRenderer.invoke('personality:get'),
      personalityPrompt: () => ipcRenderer.invoke('personality:prompt'),
      promptStats: () => ipcRenderer.invoke('prompt:stats'),
    }
  : {};

const screenBridge = rendererScreen === 'avatar'
  ? {
      // Avatar-specific commands
      sendAvatarSpeak: (payload) => ipcRenderer.invoke('avatar:speak', payload),
      sendAvatarStop: () => ipcRenderer.invoke('avatar:stop'),
      sendAvatarSetMood: (payload) => ipcRenderer.invoke('avatar:set-mood', payload),
      sendAvatarPlayMotion: (payload) => ipcRenderer.invoke('avatar:play-motion', payload),
      sendAvatarCommand: (command) => ipcRenderer.invoke('avatar:command', command),
      notifyAvatarPlayback: (payload) => ipcRenderer.send('avatar:playback', payload),
      onAvatarCommand: (callback) => subscribe('avatar-command', callback),
      onAvatarStatus: (callback) => subscribe('avatar-status', callback),
    }
  : rendererScreen === 'canvas'
    ? {
        // Canvas-specific commands
        getCanvasState: () => ipcRenderer.invoke('canvas:get-state'),
        closeCanvas: () => ipcRenderer.invoke('canvas:close'),
        setCanvasLayout: (layout) => ipcRenderer.invoke('canvas:set-layout', layout),
        onCanvasState: (callback) => subscribe('canvas-state', callback),
        onAvatarStatus: (callback) => subscribe('avatar-status', callback),
      }
    : {
        // Chat / Main Bridge access
        sendChatMessage: (text) => ipcRenderer.invoke('chat:send', text),
        stopChatMessage: () => ipcRenderer.invoke('chat:stop'),
        setWindowAlwaysOnTop: (target, enabled) => ipcRenderer.invoke('window:set-always-on-top', target, enabled),
        getAppState: () => ipcRenderer.invoke('app:get-state'),
        setSelectedBrain: (brainId) => ipcRenderer.invoke('brain:set-selected', brainId),
        setOllamaConfig: (config) => ipcRenderer.invoke('brain:set-ollama-config', config),
        testBrain: (brainId) => ipcRenderer.invoke('brain:test', brainId),
        openWorkspaceFolder: () => ipcRenderer.invoke('workspace:open-folder'),
        completeWorkspaceBootstrap: () => ipcRenderer.invoke('workspace:complete-bootstrap'),
        getChatHistory: () => ipcRenderer.invoke('chat:get-history'),
        getCanvasState: () => ipcRenderer.invoke('canvas:get-state'),
        openCanvas: (payload) => ipcRenderer.invoke('canvas:open', payload),
        updateCanvas: (payload) => ipcRenderer.invoke('canvas:update', payload),
        closeCanvas: () => ipcRenderer.invoke('canvas:close'),
        setCanvasLayout: (layout) => ipcRenderer.invoke('canvas:set-layout', layout),
        browserNavigate: (payload) => ipcRenderer.invoke('browser:navigate', payload),
        browserRefresh: (payload) => ipcRenderer.invoke('browser:refresh', payload),
        browserAction: (payload) => ipcRenderer.invoke('browser:action', payload),
        readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
        writeClipboardText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
        onAvatarStatus: (callback) => subscribe('avatar-status', callback),
        onChatStream: (callback) => subscribe('chat-stream', callback),
        onCanvasState: (callback) => subscribe('canvas-state', callback),
      };

/**
 * Electron API exposed to renderer processes.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  ...screenBridge,
  ...developmentOnlyBridge,
  rendererScreen,
  devToolsEnabled: enableRendererDevTools,
});
