const { app, BrowserWindow, ipcMain, screen, clipboard, shell, protocol, session, net: electronNet } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const fsPromises = require('fs/promises');
const net = require('net');
const { randomUUID } = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { createRendererLoop, isRendererUnavailable } = require('./renderer-loop');
const {
  buildRendererCsp,
  createPermissionRequestHandler,
  isTrustedAppUrl,
  registerValidatedIpcHandler,
} = require('./security');
const {
  installAppProtocol,
  registerAppProtocolSchemes,
} = require('./app-protocol');
const {
  registerSafeIpcHandlers,
} = require('./register-safe-ipc');
const {
  sanitizeShellOutput,
  sanitizeFileOutput,
  sanitizeWebOutput,
  sanitizeGenericOutput,
} = require('./middleware/output-sanitizer');

registerAppProtocolSchemes(protocol);
app.enableSandbox();

// Reduce GPU memory pressure when multiple windows start simultaneously (Windows).
// Only safe flags — use-angle and enable-features caused GPU process crashes (0xC0000409).
app.commandLine.appendSwitch('disable-gpu-memory-buffer-compositor-resources');
app.commandLine.appendSwitch('disable-gpu-sandbox');

// ============================================================
// Refactored modules - ready for incremental adoption
// ============================================================
// These modules extract and fix the issues identified in the code review:
// - constants.js: All magic numbers extracted as named constants
// - state-manager.js: Race condition fixes with ChatRequestManager lock
// - acp-runtime.js: Qwen ACP runtime with memory leak prevention
// - tts-service.js: Kokoro TTS with response caching
// - browser-agent.js: PinchTab browser automation
// - computer-control.js: PowerShell/computer use with injection fixes + fetch-based Ollama probe
// - workspace-manager.js: Workspace management with write-side file size enforcement
// - window-manager.js: Electron window management
//
// To adopt: replace inline function calls with module imports gradually.
// Each module exports the same function signatures as the original code.
// ============================================================
const C = require('./constants');
const { ChatRequestManager, PlaybackWaiterManager, SpeechResetManager, StatusManager } = require('./state-manager');
const { QwenAcpRuntime } = require('./acp-runtime');
const { TtsService } = require('./tts-service');
const {
  createMessageId,
  createSystemMessage,
  runMemorySearch,
  runSessionSearch,
  runMemoryGet,
  normalizeLine,
  truncatePromptText,
  normalizeSpeechText,
  readJsonFile,
  writeJsonFile,
  readTextFile,
  writeTextFile,
  isBootstrapAnswerEmpty,
  getBootstrapMissingFieldIds,
  getBootstrapInitialPrompt,
  buildBootstrapAnswersPrompt,
  updateBootstrapStateFromAcp,
} = require('./workspace-manager');
const {
  runShellCommand,
  stopShellProcess,
  listShellProcesses,
  stopAllShellProcesses,
  isDangerous,
} = require('./shell-tool');
const {
  readTextFile: readFileTool,
  writeTextFile: writeFileTool,
  editFile: editFileTool,
  deleteFile: deleteFileTool,
  listDirectory,
} = require('./file-tool');
const {
  globFiles,
  grepFiles,
  readManyFiles,
} = require('./search-tool');
const {
  applyPatch,
  applyPatchText,
} = require('./apply-patch');
const {
  gitHandleAction,
} = require('./git-tool');
const {
  webFetch,
  webSearch,
} = require('./web-tool');
const {
  generateOllamaResponse,
  listOllamaModels,
} = require('./ollama-client');
const {
  createDefaultTaskState,
  handleTaskAction,
  getTaskSummary,
} = require('./task-tool');
const {
  detectFrustration,
} = require('./frustration-detector');
const {
  createDefaultCircuitBreakerState,
  recordSuccess,
  recordFailure,
  resetCircuitBreaker,
  getCircuitBreakerStatus,
  canExecute,
} = require('./circuit-breaker');
const {
  createDefaultDreamState,
  onUserInteraction,
  scheduleDream,
  analyzeConversation,
  generateDreamNote,
  saveDreamNote,
  cleanupOldDreams,
  stopDream,
  getDreamStatus,
  DREAM_IDLE_TIMEOUT_MS,
} = require('./dream-mode');
const {
  createDefaultPersonalityState,
  updatePersonality,
  getPersonalityPrompt,
  savePersonality,
  loadPersonality,
} = require('./personality-manager');
const {
  createDefaultPromptCacheState,
  updateStaticPrompt,
  updateDynamicContext,
  buildOptimizedPrompt,
  getPromptStats,
  estimateTokenCount,
  isPromptTooLong,
  trimPrompt,
} = require('./prompt-optimizer');
const {
  initializeHooks,
  getHooksStatus,
  HOOK_EVENTS,
} = require('./hooks-setup');
const {
  registerHook,
  emitHook,
} = require('./hooks');
const {
  smartPrune,
  getContextStats,
  MAX_CONTEXT_TOKENS,
} = require('./session-pruning');
const {
  loadSkills,
  matchSkill,
  executeSkill,
  listSkills,
} = require('./skills');
const {
  ensurePywinautoMcpService: ccEnsurePywinautoMcpService,
  stopPywinautoMcpService: ccStopPywinautoMcpService,
  callPywinautoTool: ccCallPywinautoTool,
  readPywinautoActiveWindowDetails: ccReadPywinautoActiveWindowDetails,
  getPywinautoMcpLogTail: ccGetPywinautoMcpLogTail,
} = require('./computer-control');
const {
  buildBrowserTitleFromUrl: baBuildBrowserTitleFromUrl,
  normalizeCanvasLayout: baNormalizeCanvasLayout,
  resolveBrowserCanvasContent: baResolveBrowserCanvasContent,
  performBrowserAction: baPerformBrowserAction,
  stopPinchtabService: baStopPinchtabService,
} = require('./browser-agent');
// Aliases for backward compat — functions now live in browser-agent.js
const {
  getDisplayById: wmGetDisplayById,
  isBoundsVisible: wmIsBoundsVisible,
  getWindowLayout: wmGetWindowLayout,
  getCanvasBoundsForLayout: wmGetCanvasBoundsForLayout,
  createAvatarWindow: wmCreateAvatarWindow,
  createChatWindow: wmCreateChatWindow,
  createCanvasWindow: wmCreateCanvasWindow,
  getAvatarWindow: wmGetAvatarWindow,
  setAvatarWindow: wmSetAvatarWindow,
  getChatWindow: wmGetChatWindow,
  setChatWindow: wmSetChatWindow,
  getCanvasWindow: wmGetCanvasWindow,
  setCanvasWindow: wmSetCanvasWindow,
  getWindows: wmGetWindows,
  persistWindowStateNow: wmPersistWindowStateNow,
  schedulePersistWindowState: wmSchedulePersistWindowState,
  bindPersistentBounds: wmBindPersistentBounds,
  applyAlwaysOnTop: wmApplyAlwaysOnTop,
  getCurrentWindowPrefs: wmGetCurrentWindowPrefs,
} = require('./window-manager');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
// Constants now available from ./constants.js (C.* references)
// Keeping inline for backward compatibility - migrate gradually
const ACP_TIMEOUT_MS = C.ACP_TIMEOUT_MS;
const QWEN_PS1_PATH = C.QWEN_PS1_PATH;
const QWEN_CLI_JS_PATH = C.QWEN_CLI_JS_PATH;
const AGENT_ROUTER_PATH = C.AGENT_ROUTER_PATH;
const AGENT_MODELS_CONFIG_PATH = C.AGENT_MODELS_CONFIG_PATH;
const PINCHTAB_PS1_PATH = C.PINCHTAB_PS1_PATH;
const PINCHTAB_CLI_PATH = C.PINCHTAB_CLI_PATH;
const PINCHTAB_HOST = C.PINCHTAB_HOST;
const PINCHTAB_PORT = C.PINCHTAB_PORT;
const PINCHTAB_URL = C.PINCHTAB_URL;
const PINCHTAB_TOKEN = C.PINCHTAB_TOKEN;
const PINCHTAB_HEADLESS = C.PINCHTAB_HEADLESS;
const PINCHTAB_STARTUP_TIMEOUT_MS = C.PINCHTAB_STARTUP_TIMEOUT_MS;
const PYWINAUTO_MCP_REPO_URL = C.PYWINAUTO_MCP_REPO_URL;
const PYWINAUTO_MCP_HOST = C.PYWINAUTO_MCP_HOST;
const PYWINAUTO_MCP_PORT = C.PYWINAUTO_MCP_PORT;
const PYWINAUTO_MCP_URL = C.PYWINAUTO_MCP_URL;
const PYWINAUTO_MCP_STARTUP_TIMEOUT_MS = C.PYWINAUTO_MCP_STARTUP_TIMEOUT_MS;
const TTS_PROVIDER = C.TTS_PROVIDER;
const KOKORO_SERVER_SCRIPT = C.KOKORO_SERVER_SCRIPT;
const KOKORO_HOST = C.KOKORO_HOST;
const KOKORO_PORT = C.KOKORO_PORT;
const KOKORO_URL = C.KOKORO_URL;
const KOKORO_SPEAKER = C.KOKORO_DEFAULT_SPEAKER;
const KOKORO_PYTHON = C.KOKORO_PYTHON;
const KOKORO_STARTUP_TIMEOUT_MS = C.KOKORO_STARTUP_TIMEOUT_MS;
const MAX_CHAT_HISTORY = C.MAX_CHAT_HISTORY;
const MAX_INITIAL_PROMPT_HISTORY = C.MAX_INITIAL_PROMPT_HISTORY;
const BROWSER_AGENT_HARD_LIMIT = C.BROWSER_AGENT_HARD_LIMIT;
const COMPUTER_ACTION_TIMEOUT_MS = C.COMPUTER_ACTION_TIMEOUT_MS;
const COMPUTER_OCR_MAX_CHARS = C.COMPUTER_OCR_MAX_CHARS;
const WORKSPACE_DIRNAME = C.WORKSPACE_DIRNAME;
const WORKSPACE_DAILY_MEMORY_DIRNAME = C.WORKSPACE_DAILY_MEMORY_DIRNAME;
const WORKSPACE_FILE_MAX_CHARS = C.WORKSPACE_FILE_MAX_CHARS;
const WORKSPACE_TOTAL_MAX_CHARS = C.WORKSPACE_TOTAL_MAX_CHARS;
const WORKSPACE_DAILY_NOTE_MAX_CHARS = C.WORKSPACE_DAILY_NOTE_MAX_CHARS;
const WORKSPACE_REQUIRED_FILES = C.WORKSPACE_REQUIRED_FILES;
const WORKSPACE_MUTABLE_FILES = C.WORKSPACE_MUTABLE_FILES;
const SESSIONS_DIRNAME = C.SESSIONS_DIRNAME;
const SESSION_SEARCH_MAX_RESULTS = C.SESSION_SEARCH_MAX_RESULTS;
const MEMORY_SEARCH_MAX_RESULTS = C.MEMORY_SEARCH_MAX_RESULTS;
const DEFAULT_CHAT_WIDTH = C.DEFAULT_CHAT_WIDTH;
const DEFAULT_CANVAS_WIDTH = C.DEFAULT_CANVAS_WIDTH;
const ENABLE_LIVE_CANVAS = C.ENABLE_LIVE_CANVAS;
const REASONING_TAG_NAMES = C.REASONING_TAG_NAMES;
const DEFAULT_BRAIN_ID = C.DEFAULT_BRAIN_ID;
const DEFAULT_OLLAMA_HOST = C.OLLAMA_HOST;
const DEFAULT_OLLAMA_MODEL = C.DEFAULT_OLLAMA_MODEL;
const BRAIN_REGISTRY = C.BRAIN_REGISTRY;
const STREAM_STATUS = C.STREAM_STATUS;

// Simple factory functions (also in workspace-manager.js)
function createEmptyMemory() {
  return { updatedAt: '', summary: '', stablePreferences: [], recentTopics: [] };
}

function createEmptyAcpSession() {
  return { id: '', createdAt: '', lastUsedAt: '', turnCount: 0 };
}

function createEmptyChatSession() {
  return { id: '', createdAt: '', lastUsedAt: '', compactionCount: 0 };
}

function createDefaultBootstrapState() {
  return { active: false, startedAt: null, updatedAt: null, stepIndex: 0, currentPrompt: '', answers: {} };
}


let currentStatus = 'idle';
let brainMode = 'booting';
let streamStatus = STREAM_STATUS.DISCONNECTED;
let ttsStatus = 'idle';
let ttsLatencyMs = null;
let ttsLastError = null;
let persistWindowStateTimer = null;
let chatHistory = [];
let nyxMemory = createEmptyMemory();
let acpSession = createEmptyAcpSession();
let chatSession = createEmptyChatSession();
let activeChatRequest = null;
let activeResponseId = null;
let speechResetTimer = null;
let avatarStatusLoop = null;
let chatStatusLoop = null;
let canvasStatusLoop = null;
let cleanupStarted = false;
let ttsServiceLogTail = '';
let ttsWarmupTimer = null;
let qwenAcpStderrTail = '';

let taskState = createDefaultTaskState();
let circuitBreakerState = createDefaultCircuitBreakerState();
let dreamState = createDefaultDreamState();
let personalityState = createDefaultPersonalityState();
let promptCacheState = createDefaultPromptCacheState();

function appendQwenAcpStderr(text) {
  const line = String(text || '').replace(/\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  qwenAcpStderrTail = `${qwenAcpStderrTail}\n${line}`.trim().slice(-2000);
}

function sanitizeCliOutput(text, brainId = '') {
  const raw = String(text || '');
  let cleaned = raw.replace(/\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  cleaned = cleaned.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (brainId === 'ollama') {
    const jsonMatch = cleaned.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (jsonMatch) {
      try { cleaned = JSON.parse(`{"text":${JSON.stringify(jsonMatch[1])}}`).text; } catch { /* fall through */ }
    }
  }
  return cleaned.trim();
}

let canvasState = createDefaultCanvasState();
let browserAgentState = createDefaultBrowserAgentState();
let computerState = createDefaultComputerState();
let workspaceState = createDefaultWorkspaceState();
let brainState = createDefaultBrainState();
let brainSessionHints = {};
function createQwenAcpRuntime() {
  const selectedBrain = getSelectedBrainOption();
  const useNodeLauncher = fs.existsSync(QWEN_CLI_JS_PATH);
  const launcherCommand = useNodeLauncher
    ? 'node'
    : String(selectedBrain?.commandPath || BRAIN_REGISTRY.qwen.command || 'qwen');
  const launcherArgs = useNodeLauncher
    ? [QWEN_CLI_JS_PATH, '--acp', '--channel', 'ACP']
    : ['--acp', '--channel', 'ACP'];

  return new QwenAcpRuntime({
    cwd: path.join(__dirname, '..'),
    reasoningTagNames: REASONING_TAG_NAMES,
    requestTimeoutMs: ACP_TIMEOUT_MS,
    launcherCommand,
    launcherArgs,
    onStderrAppend: appendQwenAcpStderr,
    onStreamChunk: (delta) => {
      activeChatRequest?.streamEmitter?.queue(delta);
    },
  });
}

let qwenAcpRuntime = null;
let bootstrapState = createDefaultBootstrapState();
let avatarPlaybackWaiters = new Map();

function createDefaultBrainState() {
  return {
    selectedId: DEFAULT_BRAIN_ID,
    options: [],
    sourcePath: AGENT_ROUTER_PATH,
    modelsPath: AGENT_MODELS_CONFIG_PATH,
    ollama: {
      host: DEFAULT_OLLAMA_HOST,
      model: DEFAULT_OLLAMA_MODEL,
    },
    ollamaStatus: {
      checkedAt: null,
      reachable: false,
      modelAvailable: false,
      availableModels: [],
      error: '',
    },
    updatedAt: null,
  };
}

function createDefaultCanvasState() {
  return {
    isOpen: false,
    layout: 'right-docked',
    content: {
      type: 'empty',
      title: 'Canvas',
      value: '',
    },
    lastAvatarBoundsBeforeSplit: null,
  };
}

function getCurrentBrowserSnapshot() {
  if (canvasState.content?.type !== 'browser') {
    return {
      currentUrl: '',
      pageTitle: '',
      pageStatus: 'idle',
      totalRefs: 0,
    };
  }

  return {
    currentUrl: canvasState.content.currentUrl || canvasState.content.url || '',
    pageTitle: canvasState.content.pageTitle || canvasState.content.title || 'Browser',
    pageStatus: canvasState.content.status || 'idle',
    totalRefs: Array.isArray(canvasState.content.snapshotItems) ? canvasState.content.snapshotItems.length : 0,
  };
}

function createDefaultBrowserAgentState() {
  return {
    active: false,
    requestId: null,
    goal: '',
    phase: 'idle',
    stepIndex: 0,
    maxSteps: null,
    action: '',
    chosenRef: '',
    reason: '',
    lastMessage: '',
    updatedAt: null,
    ...getCurrentBrowserSnapshot(),
  };
}

function createDefaultComputerState() {
  return {
    supported: process.platform === 'win32',
    active: false,
    phase: 'idle',
    requestId: null,
    currentAction: '',
    updatedAt: null,
    width: 0,
    height: 0,
    cursorX: 0,
    cursorY: 0,
    foregroundTitle: '',
    foregroundProcess: '',
    foregroundBounds: null,
    foregroundHandle: null,
    windows: [],
    interactiveElements: [],
    lastAction: '',
    lastResult: '',
    lastScreenshotPath: '',
    lastScreenshotText: '',
    lastReadSource: '',
    desktopBackend: 'native',
    ocrStatus: 'idle',
    error: '',
  };
}

function createDefaultWorkspaceState() {
  return {
    path: '',
    dailyMemoryPath: '',
    memoryFile: '',
    bootstrapPending: false,
    bootConfigured: false,
    startupBootPending: false,
    files: [],
    missingRequiredFiles: [],
    dailyNotes: [],
    bootstrapActive: false,
    bootstrapStepIndex: 0,
    bootstrapTotalSteps: 0,
    bootstrapQuestion: '',
    updatedAt: null,
  };
}


async function getBrainSpawnConfig(prompt, sessionConfig = {}, overrideBrain = null) {
  const selectedBrain = overrideBrain || getSelectedBrainOption();

  // Ollama usa API HTTP, non ACP
  if (selectedBrain?.id === 'ollama') {
    return {
      brainId: selectedBrain.id,
      kind: 'ollama-http',
      url: String(brainState.ollama?.host || createDefaultBrainState().ollama.host).replace(/\/+$/, ''),
      model: String(brainState.ollama?.model || createDefaultBrainState().ollama.model).trim() || createDefaultBrainState().ollama.model,
      launcherLabel: `ollama@${String(brainState.ollama?.host || createDefaultBrainState().ollama.host)}`,
      supportsSessionResume: false,
      shell: false,
      env: process.env,
    };
  }

  // Qwen usa ACP nativo con --acp --channel ACP
  if (selectedBrain?.id === 'qwen') {
    return {
      brainId: 'qwen',
      kind: 'qwen-acp',
      launcherLabel: selectedBrain.commandPath || (fs.existsSync(QWEN_CLI_JS_PATH) ? `node ${QWEN_CLI_JS_PATH}` : (selectedBrain.commandPath || BRAIN_REGISTRY.qwen.command)),
      supportsSessionResume: true,
      env: process.env,
    };
  }

  // Fallback per brain non supportati
  throw new Error(`Brain non supportato: ${selectedBrain?.id}`);
}

function getAppFilePath(name) {
  return path.join(app.getPath('userData'), name);
}


function getCanvasStatePath() {
  return getAppFilePath('canvas-state.json');
}

function getChatHistoryPath() {
  return getAppFilePath('chat-history.json');
}

function getAcpSessionPath() {
  return getAppFilePath('acp-session.json');
}

function getChatSessionPath() {
  return getAppFilePath('chat-session.json');
}

function getBootstrapStatePath() {
  return getAppFilePath('bootstrap-state.json');
}

function getNyxMemoryPath() {
  return getAppFilePath('nyx-memory.json');
}

function getSessionRecordPath(sessionId) {
  return path.join(getSessionsDirPath(), `${sessionId}.json`);
}

function getSessionMarkdownPath(sessionId) {
  return path.join(getSessionsDirPath(), `${sessionId}.md`);
}

function getBrainStatePath() {
  return getAppFilePath('brain-state.json');
}

function ensureUserDataDir() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
}

function getWindowStatePath() {
  return getAppFilePath('window-state.json');
}

function parseAgentRouterBrains() {
  const text = readTextFile(AGENT_ROUTER_PATH, '');
  if (!text) {
    return [];
  }

  return Array.from(text.matchAll(/"([a-z0-9_-]+)"\s*:\s*\{[\s\S]*?"description":\s*"([^"]+)"/gi))
    .map((match) => ({
      id: String(match[1] || '').trim().toLowerCase(),
      description: String(match[2] || '').trim(),
    }))
    .filter((item, index, list) => item.id && list.findIndex((candidate) => candidate.id === item.id) === index);
}

function findCommandPath(commandName) {
  if (!commandName) return '';

  const appDataBin = path.join(process.env.APPDATA || '', 'npm', `${commandName}.cmd`);
  if (fs.existsSync(appDataBin)) {
    return appDataBin;
  }

  try {
    const result = spawnSync('where.exe', [commandName], {
      windowsHide: true,
      encoding: 'utf8',
    });
    if (result.status === 0) {
      return String(result.stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) || '';
    }
  } catch {
    // ignore resolution errors
  }

  return '';
}

// normalizeLine, normalizeSpeechText, truncatePromptText imported from workspace-manager
// normalizeComputerOcrText, stripAnsi imported from modules above
// createStreamEmitter imported from state-manager

function normalizeComputerOcrText(text, maxLength) {
  const normalized = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}\u2026`;
}


function getBrainSessionHint(brainId) {
  return brainSessionHints[String(brainId || '').trim().toLowerCase()] || { hasSession: false };
}

function markBrainSessionActive(brainId) {
  const id = String(brainId || '').trim().toLowerCase();
  if (!id) return;
  brainSessionHints[id] = {
    ...brainSessionHints[id],
    hasSession: true,
    updatedAt: new Date().toISOString(),
  };
}

function resetBrainRuntimeState() {
  brainSessionHints = {};
  qwenAcpRuntime?.clearLoadedSessionId();
}

// waitForLocalPort, appendQwenAcpStderr, syncAcpSessionToQwen
// moved to acp-runtime.js - main.js now uses thin wrappers around QwenAcpRuntime

function stopQwenAcpRuntime(silent = false) {
  qwenAcpRuntime?.stop(silent);
  qwenAcpRuntime = null;
}

function qwenAcpSendNotification(method, params = null) {
  if (!qwenAcpRuntime) {
    throw new Error('Qwen ACP non disponibile.');
  }
  qwenAcpRuntime.sendNotification(method, params);
}

function qwenAcpSendRequest(method, params = null, timeoutMs = ACP_TIMEOUT_MS) {
  if (!qwenAcpRuntime) {
    return Promise.reject(new Error('Qwen ACP non disponibile.'));
  }
  return qwenAcpRuntime.sendRequest(method, params, timeoutMs);
}

async function ensureQwenAcpRuntime() {
  const hasLiveRuntime = Boolean(qwenAcpRuntime?.proc && !qwenAcpRuntime.proc.killed);
  if (!hasLiveRuntime) {
    qwenAcpRuntime = createQwenAcpRuntime();
  }
  await qwenAcpRuntime.ensure();
  return qwenAcpRuntime;
}

async function ensureQwenAcpSession(sessionConfig = {}) {
  await ensureQwenAcpRuntime();

  // Se c'è già una sessione caricata, riutilizzala
  const sessionId = await qwenAcpRuntime.ensureSession();
  syncAcpSessionToQwen(sessionId, true);
  return sessionId;
}

async function runQwenAcpTurn(requestId, prompt, userText, sessionConfig, options = {}) {
  await ensureQwenAcpRuntime();
  let sessionId = '';
  try {
    sessionId = await ensureQwenAcpSession(sessionConfig);
  } catch (error) {
    // Se fallisce, resetta e riprova una volta sola
    if (!options.qwenSessionResetAttempted) {
      resetAcpSession(sessionConfig.id);
      qwenAcpRuntime?.clearLoadedSessionId();
      return runQwenAcpTurn(requestId, prompt, userText, prepareAcpSessionTurn(), {
        ...options,
        qwenSessionResetAttempted: true,
      });
    }
    throw error;
  }

  const controller = new AbortController();
  if (!activeChatRequest || activeChatRequest.id !== requestId) {
    activeChatRequest = {
      id: requestId,
      proc: null,
      abortController: controller,
      cancelFn: async () => {
        if (sessionId) {
          qwenAcpSendNotification('session/cancel', { sessionId });
        }
      },
      cancelled: false,
      buffer: '',
      preview: '',
      acpSessionId: sessionId,
      acpSessionNew: sessionConfig.isNew,
      streamEmitter: createStreamEmitter(requestId),
    };
  } else {
    activeChatRequest.proc = null;
    activeChatRequest.abortController = controller;
    activeChatRequest.cancelFn = async () => {
      if (sessionId) {
        qwenAcpSendNotification('session/cancel', { sessionId });
      }
    };
    activeChatRequest.buffer = '';
    activeChatRequest.preview = '';
    activeChatRequest.acpSessionId = sessionId;
    activeChatRequest.acpSessionNew = sessionConfig.isNew;
  }

  const timer = setTimeout(() => {
    stopActiveChatRequest('timeout');
  }, ACP_TIMEOUT_MS);

  try {
    const turnResult = await qwenAcpRuntime.runTurn(requestId, prompt, {
      sessionId,
      isNewSession: Boolean(sessionConfig.isNew),
      streamPreview: Boolean(options.streamPreview),
    });

    clearTimeout(timer);
    if (activeChatRequest?.id === requestId) {
      activeChatRequest.proc = null;
      activeChatRequest.abortController = null;
      activeChatRequest.cancelFn = null;
    }

    if (isRequestCancelled(requestId)) {
      const cancelledError = new Error(activeChatRequest?.stopReason === 'timeout' ? 'timeout' : 'cancelled');
      cancelledError.code = activeChatRequest?.stopReason || 'cancelled';
      throw cancelledError;
    }

    const buffer = String(turnResult?.buffer || '').trim();
    const response = parseInlineResponse(buffer, userText, { strictJson: options.strictJson === true });
    const phasePlan = parsePhasePlan(buffer, userText, { strictJson: options.strictJson === true });
    if (turnResult?.reasoning && !response.reasoning) {
      response.reasoning = normalizeLine(turnResult.reasoning, 4000);
    }

    return {
      buffer,
      response,
      phasePlan,
      sessionId: turnResult?.sessionId || sessionId,
      stopReason: turnResult?.stopReason || 'end_turn',
    };
  } catch (error) {
    clearTimeout(timer);
    if (activeChatRequest?.id === requestId) {
      activeChatRequest.proc = null;
      activeChatRequest.abortController = null;
      activeChatRequest.cancelFn = null;
    }

    if (error?.name === 'AbortError') {
      const cancelledError = new Error(activeChatRequest?.stopReason === 'timeout' ? 'timeout' : 'cancelled');
      cancelledError.code = activeChatRequest?.stopReason || 'cancelled';
      throw cancelledError;
    }

    throw error;
  }
}

function normalizeOllamaHost(input) {
  const value = String(input || '').trim();
  return value || DEFAULT_OLLAMA_HOST;
}

function normalizeOllamaModel(input) {
  const value = String(input || '').trim();
  return value || DEFAULT_OLLAMA_MODEL;
}

async function probeOllamaStatus(host, model) {
  const normalizedHost = String(host || '').trim().replace(/\/+$/, '') || DEFAULT_OLLAMA_HOST;
  const normalizedModel = String(model || '').trim() || DEFAULT_OLLAMA_MODEL;

  try {
    const models = await listOllamaModels(normalizedHost);

    return {
      checkedAt: new Date().toISOString(),
      reachable: true,
      modelAvailable: models.includes(normalizedModel),
      availableModels: models,
      error: '',
    };
  } catch (error) {
    return {
      checkedAt: new Date().toISOString(),
      reachable: false,
      modelAvailable: false,
      availableModels: [],
      error: normalizeLine(error?.message || 'Host Ollama non raggiungibile.', 220),
    };
  }
}

function buildBrainCatalog(ollamaConfig = null) {
  const parsedAgents = parseAgentRouterBrains();
  const discoveredIds = parsedAgents.length
    ? Array.from(new Set([...parsedAgents.map((item) => item.id), 'ollama']))
    : Object.keys(BRAIN_REGISTRY);
  const modelsConfig = readJsonFile(AGENT_MODELS_CONFIG_PATH, {});
  const defaultModels = modelsConfig.default_models || {};
  const effectiveOllamaConfig = {
    ...createDefaultBrainState().ollama,
    ...(brainState.ollama || {}),
    ...(ollamaConfig || {}),
  };
  const ollamaHost = normalizeOllamaHost(effectiveOllamaConfig.host);
  const ollamaModel = normalizeOllamaModel(effectiveOllamaConfig.model);
  const cachedOllamaStatus = brainState.ollamaStatus || {
    checkedAt: null, reachable: false, modelAvailable: false, availableModels: [], error: '',
  };

  return discoveredIds
    .filter((id) => BRAIN_REGISTRY[id] && BRAIN_REGISTRY[id].selectable !== false)
    .map((id) => {
      const registryEntry = BRAIN_REGISTRY[id];
      const parsed = parsedAgents.find((item) => item.id === id);
      const commandPath = id === 'ollama'
        ? ollamaHost
        : (id === 'qwen'
        ? (fs.existsSync(QWEN_CLI_JS_PATH) ? QWEN_CLI_JS_PATH : (fs.existsSync(QWEN_PS1_PATH) ? QWEN_PS1_PATH : ''))
        : findCommandPath(registryEntry.command));
      const available = id === 'ollama'
        ? Boolean(cachedOllamaStatus.reachable && cachedOllamaStatus.modelAvailable)
        : Boolean(commandPath);

      return {
        id,
        label: registryEntry.label,
        description: parsed?.description || registryEntry.description,
        available,
        commandPath: commandPath || registryEntry.command,
        supportsSessionResume: Boolean(registryEntry.supportsSessionResume),
        statusReason: id === 'ollama'
          ? (cachedOllamaStatus.reachable
            ? (cachedOllamaStatus.modelAvailable ? `model ok: ${ollamaModel}` : `model mancante: ${ollamaModel}`)
            : (cachedOllamaStatus.error || 'host non raggiungibile'))
          : '',
      };
    })
    .map((item) => item.id === 'ollama'
      ? {
        ...item,
        ollamaStatus: cachedOllamaStatus,
      }
      : item);
}

function refreshBrainState() {
  const stored = readJsonFile(getBrainStatePath(), createDefaultBrainState());
  const storedOllama = {
    ...createDefaultBrainState().ollama,
    ...(stored?.ollama || {}),
  };
  const options = buildBrainCatalog(storedOllama);
  const candidateId = String(stored?.selectedId || DEFAULT_BRAIN_ID).trim().toLowerCase();
  const selectedId = options.some((item) => item.id === candidateId)
    ? candidateId
    : (options.find((item) => item.id === DEFAULT_BRAIN_ID)?.id || options[0]?.id || DEFAULT_BRAIN_ID);

  brainState = {
    selectedId,
    options,
    sourcePath: AGENT_ROUTER_PATH,
    modelsPath: AGENT_MODELS_CONFIG_PATH,
    ollama: storedOllama,
    ollamaStatus: options.find((item) => item.id === 'ollama')?.ollamaStatus || createDefaultBrainState().ollamaStatus,
    updatedAt: new Date().toISOString(),
  };

  if (brainState.ollamaStatus.reachable && !brainState.ollamaStatus.modelAvailable) {
    const preferredModel = ['qwen3.5:0.8b', 'llama3.2:1b', 'qwen3:1.7b']
      .find((candidate) => brainState.ollamaStatus.availableModels.includes(candidate));
    if (preferredModel && preferredModel !== brainState.ollama.model) {
      brainState.ollama = {
        ...brainState.ollama,
        model: preferredModel,
      };
      writeJsonFile(getBrainStatePath(), {
        selectedId,
        ollama: brainState.ollama,
      });
      const refreshedOptions = buildBrainCatalog(brainState.ollama);
      brainState.options = refreshedOptions;
      brainState.ollamaStatus = refreshedOptions.find((item) => item.id === 'ollama')?.ollamaStatus || brainState.ollamaStatus;
    }
  }
}

function persistBrainState() {
  writeJsonFile(getBrainStatePath(), {
    selectedId: brainState.selectedId,
    ollama: brainState.ollama,
  });
}

function getSelectedBrainOption() {
  if (!brainState.options?.length) {
    refreshBrainState();
  }

  return brainState.options.find((item) => item.id === brainState.selectedId)
    || brainState.options[0]
    || {
      id: DEFAULT_BRAIN_ID,
      label: 'Qwen',
      description: 'Qwen Code CLI',
      available: false,
      commandPath: QWEN_CLI_JS_PATH,
      supportsSessionResume: true,
    };
}

function hasSelectedBrainLauncher() {
  return Boolean(getSelectedBrainOption()?.available);
}

function setSelectedBrain(brainId) {
  refreshBrainState();
  const normalizedId = String(brainId || '').trim().toLowerCase();
  const next = brainState.options.find((item) => item.id === normalizedId);
  if (!next) {
    return { ok: false, error: `Brain non disponibile: ${brainId}` };
  }

  brainState = {
    ...brainState,
    selectedId: next.id,
    updatedAt: new Date().toISOString(),
  };
  persistBrainState();
  setStreamStatus(next.available ? STREAM_STATUS.CONNECTED : STREAM_STATUS.DISCONNECTED);
  if (currentStatus !== 'thinking' && currentStatus !== 'speaking' && currentStatus !== 'tts-loading') {
    setBrainMode(next.available ? 'direct-acp-ready' : 'direct-acp-missing');
  } else {
    broadcastStatus();
  }

  return {
    ok: true,
    brain: brainState,
  };
}

function setOllamaConfig(nextConfig = {}) {
  refreshBrainState();
  brainState = {
    ...brainState,
    ollama: {
      ...brainState.ollama,
      host: normalizeOllamaHost(nextConfig.host || brainState.ollama.host || ''),
      model: normalizeOllamaModel(nextConfig.model || brainState.ollama.model || ''),
    },
    updatedAt: new Date().toISOString(),
  };
  const refreshedOptions = buildBrainCatalog(brainState.ollama);
  brainState.options = refreshedOptions;
  brainState.ollamaStatus = refreshedOptions.find((item) => item.id === 'ollama')?.ollamaStatus || createDefaultBrainState().ollamaStatus;
  persistBrainState();
  broadcastStatus();
  return {
    ok: true,
    brain: brainState,
  };
}

async function testBrainSelection(brainId = '') {
  refreshBrainState();
  const targetBrain = brainId
    ? (brainState.options.find((item) => item.id === String(brainId).trim().toLowerCase()) || getSelectedBrainOption())
    : getSelectedBrainOption();
  const launch = await getBrainSpawnConfig('Rispondi solo con OK.', {}, targetBrain);

  if (!targetBrain?.available) {
    return {
      ok: false,
      brainId: targetBrain?.id || brainId || '',
      message: 'Brain non disponibile.',
    };
  }

  if (launch.kind === 'ollama-http') {
    const status = await probeOllamaStatus(launch.url, launch.model);
    if (!status.reachable) {
      return {
        ok: false,
        brainId: targetBrain.id,
        message: status.error || 'Host Ollama non raggiungibile.',
      };
    }
    if (!status.modelAvailable) {
      return {
        ok: false,
        brainId: targetBrain.id,
        message: `Model Ollama non presente: ${launch.model}`,
      };
    }
    const payload = await generateOllamaResponse(launch.url, launch.model, 'Rispondi solo con OK.');
    return {
      ok: true,
      brainId: targetBrain.id,
      message: normalizeLine(payload?.response || 'OK', 160),
    };
  }

  return await new Promise((resolve) => {
    const proc = spawn(launch.command, launch.args, {
      cwd: path.join(__dirname, '..'),
      env: launch.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: Boolean(launch.shell),
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // ignore kill errors
      }
      if (launch.promptFilePath) {
        try {
          fs.rmSync(launch.promptFilePath, { force: true });
        } catch {
          // ignore temp prompt cleanup errors
        }
      }
      resolve({
        ok: false,
        brainId: targetBrain.id,
        message: 'Test brain in timeout.',
      });
    }, 30000);

    proc.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      if (launch.promptFilePath) {
        try {
          fs.rmSync(launch.promptFilePath, { force: true });
        } catch {
          // ignore temp prompt cleanup errors
        }
      }
      resolve({
        ok: false,
        brainId: targetBrain.id,
        message: error.message || 'Errore test brain.',
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (launch.promptFilePath) {
        try {
          fs.rmSync(launch.promptFilePath, { force: true });
        } catch {
          // ignore temp prompt cleanup errors
        }
      }
      const text = normalizeLine(sanitizeCliOutput(stdout || stderr, targetBrain.id) || `exit ${code}`, 220);
      resolve({
        ok: code === 0,
        brainId: targetBrain.id,
        message: text || (code === 0 ? 'OK' : `exit ${code}`),
      });
    });
  });
}

function getWorkspacePath() {
  return getAppFilePath(WORKSPACE_DIRNAME);
}

function getWorkspaceDailyMemoryPath() {
  return path.join(getWorkspacePath(), WORKSPACE_DAILY_MEMORY_DIRNAME);
}

function getWorkspaceFilePath(name) {
  return path.join(getWorkspacePath(), name);
}

function getSessionsDirPath() {
  return path.join(getWorkspacePath(), SESSIONS_DIRNAME);
}

function getLegacySessionsDirPath() {
  return getAppFilePath(SESSIONS_DIRNAME);
}

function getWorkspaceMemoryFileName() {
  if (fs.existsSync(getWorkspaceFilePath('MEMORY.md'))) return 'MEMORY.md';
  if (fs.existsSync(getWorkspaceFilePath('memory.md'))) return 'memory.md';
  return '';
}

function listRecentDailyMemoryNotes(limit = 2) {
  const memoryDir = getWorkspaceDailyMemoryPath();
  if (!fs.existsSync(memoryDir)) return [];
  try {
    return fs.readdirSync(memoryDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map((entry) => {
        const fullPath = path.join(memoryDir, entry.name);
        const stats = fs.statSync(fullPath);
        return {
          name: entry.name,
          relativePath: `${WORKSPACE_DAILY_MEMORY_DIRNAME}/${entry.name}`.replace(/\\/g, '/'),
          fullPath,
          updatedAt: stats.mtime.toISOString(),
          size: stats.size,
        };
      })
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, limit);
  } catch { return []; }
}

function buildDefaultWorkspaceFiles() {
  const username = String(process.env.USERNAME || 'utente').trim() || 'utente';
  return {
    'AGENTS.md': ['# AGENTS', '', '- Questo workspace descrive il comportamento stabile di Nyx.', '- Rispondi in italiano, in modo diretto e sobrio.', ENABLE_LIVE_CANVAS ? '- Usa CANVAS e BROWSER solo quando aggiungono valore reale.' : '- Usa BROWSER o COMPUTER solo quando aggiungono valore reale.', '- Se emerge una preferenza durevole, proponi di salvarla nei file del workspace invece di affidarti solo alla chat.'].join('\n'),
    'SOUL.md': ['# SOUL', '', 'Nyx e un avatar desktop pragmatico, lucido e concreto.', 'Evita entusiasmo artificiale, filler e rassicurazioni inutili.', 'Quando qualcosa e ambiguo, chiariscilo con precisione.'].join('\n'),
    'TOOLS.md': ['# TOOLS', '', '- ACP diretto tramite Qwen CLI con resume di sessione.', '- Browser reale tramite PinchTab.', ...(ENABLE_LIVE_CANVAS ? ['- Canvas laterale per testo, clipboard, file, immagini, video e audio.'] : ['- Computer use reale per finestre, controlli e input desktop.']), '- TTS locale per playback e lipsync.'].join('\n'),
    'IDENTITY.md': ['# IDENTITY', '', '- Nome: Nyx', ENABLE_LIVE_CANVAS ? '- Tipo: avatar desktop con chat, canvas e browser operativo' : '- Tipo: avatar desktop con chat, browser e computer use operativo', '- Modalita base: assistente tecnico e operativo'].join('\n'),
    'USER.md': ['# USER', '', `- Utente locale principale: ${username}`, '- Ambiente principale: Windows desktop', '- Aggiorna questo file con preferenze stabili, tono, naming e flussi preferiti.'].join('\n'),
    'HEARTBEAT.md': ['# HEARTBEAT', '', '<!-- Aggiungi qui checklist periodiche da tenere a mente. -->'].join('\n'),
    'BOOT.md': ['# BOOT', '', '<!-- Aggiungi qui una checklist da applicare al primo prompt dopo l avvio dell app. -->'].join('\n'),
    'BOOTSTRAP.md': ['# BOOTSTRAP', '', 'Primo avvio del workspace Nyx.', '', '1. Rivedi AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md e USER.md.', '2. Sostituisci i placeholder con istruzioni e preferenze reali.', '3. Se serve, crea MEMORY.md e i file in memory/YYYY-MM-DD.md.', '4. Quando il bootstrap e completo, esegui /bootstrap done oppure usa il pulsante dedicato nella chat.'].join('\n'),
  };
}

function ensureWorkspaceBootstrap() {
  const workspacePath = getWorkspacePath();
  const memoryDir = getWorkspaceDailyMemoryPath();
  const sessionsDir = getSessionsDirPath();
  const defaults = buildDefaultWorkspaceFiles();
  const hasBootstrapContext = [...WORKSPACE_REQUIRED_FILES, 'BOOTSTRAP.md', 'MEMORY.md', 'memory.md']
    .some((name) => fs.existsSync(path.join(workspacePath, name)));

  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });

  for (const fileName of [...WORKSPACE_REQUIRED_FILES, 'BOOT.md']) {
    const filePath = getWorkspaceFilePath(fileName);
    if (!fs.existsSync(filePath)) {
      writeTextFile(filePath, defaults[fileName]);
    }
  }

  if (!hasBootstrapContext && !fs.existsSync(getWorkspaceFilePath('BOOTSTRAP.md'))) {
    writeTextFile(getWorkspaceFilePath('BOOTSTRAP.md'), defaults['BOOTSTRAP.md']);
  }

  // Migrate legacy sessions
  const legacySessionsDir = getLegacySessionsDirPath();
  if (fs.existsSync(legacySessionsDir) && path.resolve(legacySessionsDir) !== path.resolve(sessionsDir)) {
    try {
      for (const entry of fs.readdirSync(legacySessionsDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const sourcePath = path.join(legacySessionsDir, entry.name);
        const targetPath = path.join(sessionsDir, entry.name);
        if (!fs.existsSync(targetPath)) fs.copyFileSync(sourcePath, targetPath);
      }
    } catch { /* ignore best-effort migration errors */ }
  }
}

function readWorkspaceState() {
  const workspacePath = getWorkspacePath();
  const files = [...WORKSPACE_REQUIRED_FILES, 'BOOT.md', 'BOOTSTRAP.md', 'MEMORY.md', 'memory.md']
    .map((name) => {
      const filePath = getWorkspaceFilePath(name);
      if (!fs.existsSync(filePath)) return { name, exists: false, updatedAt: null, size: 0 };
      const stats = fs.statSync(filePath);
      return { name, exists: true, updatedAt: stats.mtime.toISOString(), size: stats.size };
    });

  return {
    path: workspacePath,
    dailyMemoryPath: getWorkspaceDailyMemoryPath(),
    memoryFile: getWorkspaceMemoryFileName(),
    bootstrapPending: fs.existsSync(getWorkspaceFilePath('BOOTSTRAP.md')),
    bootConfigured: hasMeaningfulMarkdownContent(readTextFile(getWorkspaceFilePath('BOOT.md'), '')),
    startupBootPending: false,
    files,
    missingRequiredFiles: WORKSPACE_REQUIRED_FILES.filter((name) => !fs.existsSync(getWorkspaceFilePath(name))),
    dailyNotes: listRecentDailyMemoryNotes(),
    bootstrapActive: Boolean(bootstrapState?.active),
    bootstrapStepIndex: Number(bootstrapState?.stepIndex || 0),
    bootstrapTotalSteps: Math.max(1, Number(bootstrapState?.stepIndex || 0)),
    bootstrapQuestion: bootstrapState?.active ? String(bootstrapState.currentPrompt || '').trim() : '',
    updatedAt: new Date().toISOString(),
  };
}

function hasMeaningfulMarkdownContent(text = '') {
  return extractMeaningfulMarkdownLines(text).length > 0;
}

function extractMeaningfulMarkdownLines(text = '') {
  return String(text || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*#+\s*/, '').replace(/^\s*[-*]\s+\[(?: |x)\]\s*/, '').replace(/^\s*[-*]\s+/, '').trim())
    .filter((line) => line && !/^(agents|soul|tools|identity|user|heartbeat|boot|bootstrap|memory)$/i.test(line));
}

function refreshWorkspaceState() {
  workspaceState = {
    ...createDefaultWorkspaceState(),
    ...readWorkspaceState(),
  };
  return workspaceState;
}

function startBootstrapWizard() {
  bootstrapState.active = true;
  bootstrapState.currentPrompt = getBootstrapInitialPrompt();
  bootstrapState.stepIndex = 1;
  bootstrapState.answers = {};
  bootstrapState.updatedAt = new Date().toISOString();
  writeJsonFile(getBootstrapStatePath(), bootstrapState);
  refreshWorkspaceState();
  broadcastStatus();
}

function consumeStartupBootPrompt() {
  if (workspaceState.startupBootPending) {
    workspaceState.startupBootPending = false;
  }
}

function buildWorkspaceProjectContextPrompt(fileNames, options = {}) {
  const {
    title = 'PROJECT_CONTEXT',
    includeMissingMarkers = false,
    perFileMaxChars = WORKSPACE_FILE_MAX_CHARS,
    totalMaxChars = WORKSPACE_TOTAL_MAX_CHARS,
  } = options;
  let remaining = totalMaxChars;
  const sections = [];

  for (const fileName of fileNames) {
    if (!fileName || remaining <= 0) {
      break;
    }

    const filePath = getWorkspaceFilePath(fileName);
    if (!fs.existsSync(filePath)) {
      if (includeMissingMarkers) {
        sections.push(`[${fileName}]\n[missing]`);
      }
      continue;
    }

    const raw = readTextFile(filePath, '').trim();
    if (!raw) {
      if (includeMissingMarkers) {
        sections.push(`[${fileName}]\n[empty]`);
      }
      continue;
    }

    const content = truncatePromptText(raw, Math.min(perFileMaxChars, remaining));
    if (!content) {
      continue;
    }

    sections.push(`[${fileName}]\n${content}`);
    remaining -= content.length;
  }

  return sections.length ? `${title}:\n${sections.join('\n\n')}` : '';
}

// updateBootstrapStateFromAcp, buildBootstrapAcpPrompt, buildPromptRecallBlock,
// buildAutoRecallBlocks, buildCurrentSessionContextPrompt, buildSessionFlushSummary,
// appendSessionFlushToDailyMemory, runSessionSearch, listSessionRecords
// moved to workspace-manager.js - imported above with Mod suffix

function serializeCanvasContentForPersistence(content = {}) {
  if (content?.type !== 'browser') {
    return content;
  }

  return {
    type: 'browser',
    title: String(content.title || 'Browser').trim() || 'Browser',
    url: String(content.url || content.currentUrl || '').trim(),
    currentUrl: String(content.currentUrl || content.url || '').trim(),
    pageTitle: String(content.pageTitle || content.title || '').trim(),
    tabId: String(content.tabId || '').trim(),
    status: String(content.status || 'idle').trim() || 'idle',
    message: String(content.message || '').trim(),
    lastUpdatedAt: content.lastUpdatedAt || null,
  };
}

function persistAcpSession() {
  writeJsonFile(getAcpSessionPath(), acpSession);
}

function persistBootstrapState() {
  writeJsonFile(getBootstrapStatePath(), bootstrapState);
}

function persistCanvasState() {
  writeJsonFile(getCanvasStatePath(), {
    isOpen: canvasState.isOpen,
    layout: canvasState.layout,
    content: serializeCanvasContentForPersistence(canvasState.content),
  });
}

// ============================================================
// Wrapper functions: bridge workspace-manager API to main.js global state
// ============================================================

function persistChatHistory() {
  const persisted = chatHistory.slice(-MAX_CHAT_HISTORY);
  writeJsonFile(getChatHistoryPath(), persisted);
  rebuildNyxMemory();
}

function rebuildNyxMemory() {
  const memory = {
    updatedAt: new Date().toISOString(),
    summary: buildConversationSummary(chatHistory),
    stablePreferences: extractStablePreferences(chatHistory),
    recentTopics: extractRecentTopics(chatHistory),
  };
  writeJsonFile(getNyxMemoryPath(), memory);
  nyxMemory = memory;
}

function persistChatSession() {
  const record = {
    id: chatSession.id,
    createdAt: chatSession.createdAt,
    lastUsedAt: chatSession.lastUsedAt,
    compactionCount: Number(chatSession.compactionCount || 0),
    acpSessionId: acpSession.id || '',
    messageCount: chatHistory.length,
    summary: buildConversationSummary(chatHistory),
    messages: chatHistory,
  };
  writeJsonFile(getSessionRecordPath(chatSession.id), record);
  writeJsonFile(getChatSessionPath(), chatSession);
}

function compactCurrentSessionHistory() {
  if (chatHistory.length <= 8) return { ok: false, error: 'Sessione troppo corta per compattare.' };
  const preservedHead = chatHistory.slice(0, 1);
  const preservedTail = chatHistory.slice(-2);
  const middle = chatHistory.slice(1, -2);
  const summaryMessage = {
    id: createMessageId('system'),
    role: 'system',
    text: `Compaction summary: ${buildConversationSummary(middle) || 'Nessun contenuto rilevante.'}`,
    ts: new Date().toISOString(),
    compacted: true,
  };
  chatHistory = [...preservedHead, summaryMessage, ...preservedTail].slice(-MAX_CHAT_HISTORY);
  chatSession.compactionCount = Number(chatSession.compactionCount || 0) + 1;
  persistChatSession();
  persistChatHistory();
  return { ok: true, summaryMessage, chatHistory };
}

function startFreshSession(reason = 'manual-reset') {
  const relevantMessages = chatHistory.filter((m) => m?.text);
  if (relevantMessages.length) {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    const dailyPath = path.join(getWorkspaceDailyMemoryPath(), `${dateKey}.md`);
    const header = readTextFile(dailyPath, '').trim() ? '\n\n' : '# Daily Memory\n\n';
    const block = [
      `## ${now.toISOString()} | ${reason}`,
      '',
      `- Sessione: ${chatSession?.id || 'unknown'}`,
      `- Messaggi: ${relevantMessages.length}`,
      '',
      '### Summary',
      '',
      buildConversationSummary(relevantMessages) || 'Nessun contenuto rilevante.',
    ].join('\n');
    writeTextFile(dailyPath, `${readTextFile(dailyPath, '').trim()}${header}${block}\n`, WORKSPACE_FILE_MAX_CHARS);
  }
  resetAcpSession();
  writeJsonFile(getChatHistoryPath(), []);
  chatHistory = [];
  chatSession = { id: '', createdAt: '', lastUsedAt: '', compactionCount: 0 };
  persistChatSession();
  return { chatHistory: [], chatSession };
}

function resetAcpSession(sessionId = '') {
  if (sessionId && acpSession.id && acpSession.id !== sessionId) return;
  Object.assign(acpSession, createEmptyAcpSession());
  writeJsonFile(getAcpSessionPath(), acpSession);
}

function prepareAcpSessionTurn() {
  const now = new Date().toISOString();
  const isNew = !acpSession.id;
  acpSession.id = acpSession.id || require('crypto').randomUUID();
  acpSession.createdAt = acpSession.createdAt || now;
  acpSession.lastUsedAt = now;
  writeJsonFile(getAcpSessionPath(), acpSession);
  return { id: acpSession.id, isNew };
}

function markAcpSessionTurnCompleted(sessionId) {
  if (!sessionId || acpSession.id !== sessionId) return;
  acpSession.turnCount = Math.max(0, Number(acpSession.turnCount || 0)) + 1;
  acpSession.lastUsedAt = new Date().toISOString();
  writeJsonFile(getAcpSessionPath(), acpSession);
}

function syncAcpSessionToQwen(sessionId, isNew) {
  if (!sessionId) return;
  const now = new Date().toISOString();
  acpSession.id = sessionId;
  acpSession.createdAt = (isNew || !acpSession.createdAt) ? now : acpSession.createdAt;
  acpSession.lastUsedAt = now;
  writeJsonFile(getAcpSessionPath(), acpSession);
}

function completeWorkspaceBootstrap() {
  const bootstrapPath = getWorkspaceFilePath('BOOTSTRAP.md');
  if (fs.existsSync(bootstrapPath)) fs.rmSync(bootstrapPath, { force: true });
  bootstrapState.active = false;
  bootstrapState.currentPrompt = '';
  writeJsonFile(getBootstrapStatePath(), bootstrapState);
  return { ok: true, message: 'Bootstrap completato. BOOTSTRAP.md rimosso dal workspace.' };
}

function buildWorkspaceSavedMessage(result = {}) {
  const label = result.skipped ? 'Workspace gia aggiornato' : 'Saved to workspace';
  const file = String(result.file || '').trim();
  return {
    id: createMessageId('system'),
    role: 'system',
    text: file ? `${label}: ${file}` : label,
    ts: new Date().toISOString(),
  };
}

function createWorkspaceStatusText() {
  const fileSummary = workspaceState.files.filter((f) => f.exists).map((f) => f.name).join(', ');
  return [
    `Workspace: ${workspaceState.path}`,
    `Sessions dir: ${getSessionsDirPath()}`,
    `Bootstrap pendente: ${workspaceState.bootstrapPending ? 'si' : 'no'}`,
    `BOOT attivo al prossimo prompt: ${workspaceState.startupBootPending ? 'si' : 'no'}`,
    `Sessione locale: ${chatSession.id || 'assente'}`,
    chatSession.id ? `Session markdown: ${getSessionMarkdownPath(chatSession.id)}` : 'Session markdown: assente',
    `Messaggi in sessione: ${chatHistory.length}`,
    `Compactions: ${Number(chatSession.compactionCount || 0)}`,
    workspaceState.memoryFile ? `Memoria lunga: ${workspaceState.memoryFile}` : 'Memoria lunga: assente',
    workspaceState.dailyNotes.length ? `Daily notes: ${workspaceState.dailyNotes.map((n) => n.relativePath).join(', ')}` : 'Daily notes: nessuna',
    fileSummary ? `File presenti: ${fileSummary}` : 'File presenti: nessuno',
  ].join('\n');
}

function runLocalChatCommand(text) {
  const rawInput = String(text || '').trim();
  const input = rawInput.toLowerCase();

  if (input === '/bootstrap done') {
    const result = completeWorkspaceBootstrap();
    return { message: createSystemMessage(result.message), replaceHistory: false };
  }
  if (input === '/bootstrap status') {
    const currentQuestion = bootstrapState.active ? String(bootstrapState.currentPrompt || '').trim() : '';
    return { message: createSystemMessage([`Bootstrap attivo: ${bootstrapState.active ? 'si' : 'no'}`, `Bootstrap pendente: ${workspaceState.bootstrapPending ? 'si' : 'no'}`, `Round: ${Number(bootstrapState.stepIndex || 0)}`, currentQuestion ? `Domanda corrente: ${currentQuestion}` : 'Domanda corrente: nessuna'].join('\n')), replaceHistory: false };
  }
  if (input === '/workspace open') {
    shell.openPath(getWorkspacePath());
    return { message: createSystemMessage('Workspace aperto.'), replaceHistory: false };
  }
  if (input === '/workspace status') {
    return { message: createSystemMessage(createWorkspaceStatusText()), replaceHistory: false };
  }
  if (input === '/memory flush') {
    const relevantMessages = chatHistory.filter((m) => m?.text);
    let flushedPath = null;
    if (relevantMessages.length) {
      const now = new Date();
      const dateKey = now.toISOString().slice(0, 10);
      const dailyPath = path.join(getWorkspaceDailyMemoryPath(), `${dateKey}.md`);
      const header = readTextFile(dailyPath, '').trim() ? '\n\n' : '# Daily Memory\n\n';
      const block = [`## ${now.toISOString()} | manual-flush`, '', `- Sessione: ${chatSession?.id || 'unknown'}`, `- Messaggi: ${relevantMessages.length}`, '', '### Summary', '', buildConversationSummary(relevantMessages) || 'Nessun contenuto rilevante.'].join('\n');
      writeTextFile(dailyPath, `${readTextFile(dailyPath, '').trim()}${header}${block}\n`, WORKSPACE_FILE_MAX_CHARS);
      flushedPath = dailyPath;
    }
    return { message: createSystemMessage(flushedPath ? `Sessione salvata in ${path.relative(getWorkspacePath(), flushedPath).replace(/\\/g, '/')}.` : 'Nessun contenuto utile da salvare in memory/YYYY-MM-DD.md.'), replaceHistory: false };
  }
  if (input.startsWith('/memory search ')) {
    const query = rawInput.slice('/memory search '.length).trim();
    const results = runMemorySearch(app, query, { maxResults: MEMORY_SEARCH_MAX_RESULTS });
    return { message: createSystemMessage(results.length ? `Memory search:\n${results.map((item, i) => `${i + 1}. ${item.path}\n${item.snippet}`).join('\n\n')}` : 'Nessun risultato in MEMORY.md o nelle daily notes.'), replaceHistory: false };
  }
  if (input.startsWith('/memory get ')) {
    const args = rawInput.slice('/memory get '.length).trim().split(/\s+/);
    const result = runMemoryGet(app, args[0] || '', args[1] || 1, args[2] || 40);
    return { message: createSystemMessage(result.ok ? `${result.path}:${result.startLine}-${result.endLine}\n${result.text || '[vuoto]'}` : result.error), replaceHistory: false };
  }
  if (input === '/session status') {
    return { message: createSystemMessage([`Sessione: ${chatSession.id || 'assente'}`, `Creata: ${chatSession.createdAt || '-'}`, `Ultimo uso: ${chatSession.lastUsedAt || '-'}`, `Messaggi: ${chatHistory.length}`, `Compactions: ${Number(chatSession.compactionCount || 0)}`, `ACP session: ${acpSession.id || 'assente'}`].join('\n')), replaceHistory: false };
  }
  if (input.startsWith('/session search ')) {
    const query = rawInput.slice('/session search '.length).trim();
    const results = runSessionSearch(app, query, { maxResults: SESSION_SEARCH_MAX_RESULTS });
    return { message: createSystemMessage(results.length ? `Session search:\n${results.map((item, i) => `${i + 1}. ${item.id} (${item.updatedAt || 'n/a'})\n${item.snippet}`).join('\n\n')}` : 'Nessuna sessione salvata corrisponde alla query.'), replaceHistory: false };
  }
  if (input === '/compact') {
    const result = compactCurrentSessionHistory();
    return { message: createSystemMessage(result.ok ? 'Sessione compattata. Ho sostituito la parte centrale con un summary persistente.' : result.error), replaceHistory: true };
  }
  if (input === '/new' || input === '/reset') {
    startFreshSession(input === '/new' ? 'new-session' : 'reset-session');
    return { message: createSystemMessage('Sessione resettata. Transcript flushato nella daily note e contesto locale ripulito.'), replaceHistory: true };
  }
  return null;
}

function buildRecentDailyMemoryPrompt(limit = 2) {
  let remaining = Math.max(WORKSPACE_DAILY_NOTE_MAX_CHARS, limit * WORKSPACE_DAILY_NOTE_MAX_CHARS);
  const sections = [];
  for (const note of listRecentDailyMemoryNotes(limit)) {
    if (remaining <= 0) break;
    const raw = readTextFile(note.fullPath, '').trim();
    if (!hasMeaningfulMarkdownContent(raw)) continue;
    const content = truncatePromptText(raw, Math.min(WORKSPACE_DAILY_NOTE_MAX_CHARS, remaining));
    if (!content) continue;
    sections.push(`[${note.relativePath}]\n${content}`);
    remaining -= content.length;
  }
  return sections.length ? `RECENT_DAILY_MEMORY:\n${sections.join('\n\n')}` : '';
}

// Bootstrap helpers (isBootstrapAnswerEmpty, getBootstrapMissingFieldIds,
// getBootstrapInitialPrompt, buildBootstrapAnswersPrompt, updateBootstrapStateFromAcp)
// imported from workspace-manager — use C.BOOTSTRAP_FIELDS for field definitions.

function buildWorkspaceUpdateBlock(directive = {}) {
  const mode = String(directive.mode || 'append').trim();
  const content = String(directive.content || '').trim();
  if (!content) return '';
  if (mode === 'replace' || mode === 'overwrite') return content;
  return `\n\n${content}`;
}

function hasGitBinary() {
  try {
    const result = require('child_process').spawnSync('git', ['--version'], { windowsHide: true, encoding: 'utf8' });
    return result.status === 0;
  } catch { return false; }
}

function appendHistoryMessage(message) {
  chatHistory = [...chatHistory, message].slice(-MAX_CHAT_HISTORY);
  persistChatHistory();
}

function clearSpeechResetTimer() {
  if (speechResetTimer) {
    clearTimeout(speechResetTimer);
    speechResetTimer = null;
  }
}

function makePlaybackKey(requestId, segmentId) {
  return `${requestId}::${segmentId}`;
}

function resolvePlaybackWaiter(key, result) {
  const waiter = avatarPlaybackWaiters.get(key);
  if (!waiter) return;
  clearTimeout(waiter.timeout);
  avatarPlaybackWaiters.delete(key);
  waiter.resolve(result);
}

function resolvePlaybackWaitersForRequest(requestId, result) {
  for (const [key, waiter] of avatarPlaybackWaiters.entries()) {
    if (waiter.requestId === requestId) {
      clearTimeout(waiter.timeout);
      avatarPlaybackWaiters.delete(key);
      waiter.resolve(result);
    }
  }
}

function waitForAvatarPlayback(requestId, segmentId, fallbackMs) {
  const key = makePlaybackKey(requestId, segmentId);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      avatarPlaybackWaiters.delete(key);
      resolve(activeResponseId === requestId);
    }, Math.max(1000, fallbackMs));

    avatarPlaybackWaiters.set(key, {
      requestId,
      timeout,
      resolve,
    });
  });
}

function setStatus(status) {
  currentStatus = status;
  broadcastStatus();
}

function setBrainMode(mode) {
  brainMode = mode;
  broadcastStatus();
}

function setStreamStatus(status) {
  streamStatus = status;
  broadcastStatus();
}

function setTtsState(status, options = {}) {
  ttsStatus = status;

  if (Object.prototype.hasOwnProperty.call(options, 'latencyMs')) {
    ttsLatencyMs = options.latencyMs;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'error')) {
    ttsLastError = options.error;
  }

  broadcastStatus();
}



function sanitizeForIpc(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return null;
  }
}

function getAppStatePayload() {
  refreshWorkspaceState();
  if (!brainState.options?.length) {
    refreshBrainState();
  }
  const selectedBrain = getSelectedBrainOption();

  const payload = {
    status: String(currentStatus || 'idle'),
    mode: String(brainMode || 'booting'),
    streamStatus: String(streamStatus || 'disconnected'),
    qwenPath: String(QWEN_PS1_PATH || ''),
    qwenCliPath: String(QWEN_CLI_JS_PATH || ''),
    ttsProvider: String(getTtsProviderDisplayName() || ''),
    ttsStatus: String(ttsStatus || 'idle'),
    ttsLatencyMs: Number(ttsLatencyMs) || null,
    ttsLastError: ttsLastError ? String(ttsLastError) : null,
    activeRequestId: activeChatRequest?.id || activeResponseId || null,
    brain: {
      selectedId: String(selectedBrain?.id || ''),
      selectedLabel: String(selectedBrain?.label || ''),
      options: Array.isArray(brainState.options) ? brainState.options.map((o) => ({
        id: String(o?.id || ''),
        label: String(o?.label || ''),
        description: String(o?.description || ''),
        available: Boolean(o?.available),
        commandPath: String(o?.commandPath || ''),
        supportsSessionResume: Boolean(o?.supportsSessionResume),
        statusReason: String(o?.statusReason || ''),
        ollamaStatus: o?.ollamaStatus ? {
          checkedAt: o.ollamaStatus.checkedAt || null,
          reachable: Boolean(o.ollamaStatus.reachable),
          modelAvailable: Boolean(o.ollamaStatus.modelAvailable),
          availableModels: Array.isArray(o.ollamaStatus.availableModels) ? o.ollamaStatus.availableModels : [],
          error: String(o.ollamaStatus.error || ''),
        } : null,
      })) : [],
      sourcePath: String(brainState.sourcePath || ''),
      modelsPath: String(brainState.modelsPath || ''),
      ollama: {
        host: String(brainState.ollama?.host || ''),
        model: String(brainState.ollama?.model || ''),
      },
      ollamaStatus: brainState.ollamaStatus ? {
        checkedAt: brainState.ollamaStatus.checkedAt || null,
        reachable: Boolean(brainState.ollamaStatus.reachable),
        modelAvailable: Boolean(brainState.ollamaStatus.modelAvailable),
        availableModels: Array.isArray(brainState.ollamaStatus.availableModels) ? brainState.ollamaStatus.availableModels : [],
        error: String(brainState.ollamaStatus.error || ''),
      } : null,
    },
    windowPrefs: wmGetCurrentWindowPrefs(wmGetAvatarWindow(), wmGetChatWindow(), wmGetCanvasWindow(), readJsonFile(getWindowStatePath(), {})),
    canvas: {
      isOpen: Boolean(canvasState.isOpen),
      layout: String(canvasState.layout || 'right-docked'),
      contentType: String(canvasState.content?.type || 'empty'),
      title: String(canvasState.content?.title || 'Canvas'),
    },
    browserAgent: {
      active: Boolean(browserAgentState.active),
      requestId: browserAgentState.requestId || null,
      goal: String(browserAgentState.goal || ''),
      phase: String(browserAgentState.phase || 'idle'),
      stepIndex: Number(browserAgentState.stepIndex || 0),
      action: String(browserAgentState.action || ''),
      chosenRef: String(browserAgentState.chosenRef || ''),
      reason: String(browserAgentState.reason || ''),
      lastMessage: String(browserAgentState.lastMessage || ''),
      updatedAt: browserAgentState.updatedAt || null,
      currentUrl: String(browserAgentState.currentUrl || ''),
      pageTitle: String(browserAgentState.pageTitle || ''),
      pageStatus: String(browserAgentState.pageStatus || 'idle'),
      totalRefs: Number(browserAgentState.totalRefs || 0),
    },
    computer: {
      supported: Boolean(computerState.supported),
      active: Boolean(computerState.active),
      phase: String(computerState.phase || 'idle'),
      requestId: computerState.requestId || null,
      currentAction: String(computerState.currentAction || ''),
      updatedAt: computerState.updatedAt || null,
      width: Number(computerState.width || 0),
      height: Number(computerState.height || 0),
      cursorX: Number(computerState.cursorX || 0),
      cursorY: Number(computerState.cursorY || 0),
      foregroundTitle: String(computerState.foregroundTitle || ''),
      foregroundProcess: String(computerState.foregroundProcess || ''),
      foregroundBounds: computerState.foregroundBounds ? {
        x: Number(computerState.foregroundBounds.x || 0),
        y: Number(computerState.foregroundBounds.y || 0),
        width: Number(computerState.foregroundBounds.width || 0),
        height: Number(computerState.foregroundBounds.height || 0),
      } : null,
      foregroundHandle: Number(computerState.foregroundHandle) || null,
      windows: Array.isArray(computerState.windows) ? computerState.windows.slice(0, 12).map((w) => ({
        title: String(w?.title || ''),
        process: String(w?.process || ''),
      })) : [],
      interactiveElements: Array.isArray(computerState.interactiveElements) ? computerState.interactiveElements.slice(0, 20).map((e) => ({
        controlId: e?.controlId || null,
        elementType: String(e?.elementType || ''),
        label: String(e?.label || ''),
      })) : [],
      lastAction: String(computerState.lastAction || ''),
      lastResult: String(computerState.lastResult || ''),
      lastScreenshotPath: String(computerState.lastScreenshotPath || ''),
      lastScreenshotText: String(computerState.lastScreenshotText || ''),
      lastReadSource: String(computerState.lastReadSource || ''),
      desktopBackend: String(computerState.desktopBackend || 'native'),
      ocrStatus: String(computerState.ocrStatus || 'idle'),
      error: String(computerState.error || ''),
    },
    dream: {
      isActive: Boolean(dreamState.isActive),
      lastInteractionAt: dreamState.lastInteractionAt ? new Date(dreamState.lastInteractionAt).toISOString() : null,
      lastDreamAt: dreamState.lastDreamAt || null,
      dreamCount: Number(dreamState.dreamCount || 0),
      idleTimeoutMs: Number(DREAM_IDLE_TIMEOUT_MS || 0),
    },
    workspace: {
      path: String(workspaceState.path || ''),
      dailyMemoryPath: String(workspaceState.dailyMemoryPath || ''),
      memoryFile: String(workspaceState.memoryFile || ''),
      bootstrapPending: Boolean(workspaceState.bootstrapPending),
      bootConfigured: Boolean(workspaceState.bootConfigured),
      startupBootPending: Boolean(workspaceState.startupBootPending),
      files: Array.isArray(workspaceState.files) ? workspaceState.files.map((f) => ({
        name: String(f?.name || ''),
        exists: Boolean(f?.exists),
        updatedAt: f?.updatedAt || null,
        size: Number(f?.size || 0),
      })) : [],
      missingRequiredFiles: Array.isArray(workspaceState.missingRequiredFiles) ? workspaceState.missingRequiredFiles : [],
      dailyNotes: Array.isArray(workspaceState.dailyNotes) ? workspaceState.dailyNotes.map((n) => ({
        name: String(n?.name || ''),
        relativePath: String(n?.relativePath || ''),
        updatedAt: n?.updatedAt || null,
        size: Number(n?.size || 0),
      })) : [],
      bootstrapActive: Boolean(workspaceState.bootstrapActive),
      bootstrapStepIndex: Number(workspaceState.bootstrapStepIndex || 0),
      bootstrapTotalSteps: Number(workspaceState.bootstrapTotalSteps || 0),
      bootstrapQuestion: String(workspaceState.bootstrapQuestion || ''),
      updatedAt: workspaceState.updatedAt || null,
    },
  };

  return payload;
}

function sendStatusToWindow(targetWindow) {
  if (targetWindow && !isRendererUnavailable(targetWindow)) {
    targetWindow.webContents.send('avatar-status', getAppStatePayload());
  }
}

function sendAvatarCommand(command) {
  const aw = wmGetAvatarWindow();
  const available = aw && !isRendererUnavailable(aw);
  if (!available) {
    return false;
  }
  return aw.webContents.send('avatar-command', command) !== false;
}

function emitChatStream(event) {
  const cw = wmGetChatWindow();
  if (cw && !isRendererUnavailable(cw)) {
    cw.webContents.send('chat-stream', event);
  }
}

function emitSystemChatStream(requestId, message) {
  const normalizedMessage = typeof message === 'string'
    ? createSystemMessage(message)
    : {
      ...createSystemMessage(message?.text || ''),
      ...(message && typeof message === 'object' ? message : {}),
    };

  emitChatStream({
    type: 'system',
    requestId,
    message: {
      ...normalizedMessage,
      requestId,
      role: 'system',
    },
  });
}

async function runDreamCycle(personalityPath, options = {}) {
  // Fix B: skip if chatHistory unchanged since last dream run
  if (dreamState.lastHistoryLen === chatHistory.length && dreamState.dreamCount > 0) {
    return;
  }

  const requestId = options.requestId || `dream-${Date.now()}`;
  dreamState.isActive = true;
  broadcastStatus();
  emitSystemChatStream(requestId, 'Dream mode attiva. Sto analizzando la sessione in background.');

  try {
    const analysis = analyzeConversation(chatHistory);

    // Fix C: passa summary reale invece di testo hardcoded
    const conversationSummary = buildConversationSummary(chatHistory);
    const note = generateDreamNote(analysis, conversationSummary);

    // Archivio in dreams/
    const dreamPath = path.join(app.getPath('userData'), 'dreams');
    saveDreamNote(dreamPath, note);
    cleanupOldDreams(dreamPath);

    // Fix A: scrivi anche nella daily memory del workspace → l'agente la vede automaticamente
    if (analysis.preferences.length || analysis.topics.length || conversationSummary) {
      const now = new Date();
      const dateKey = now.toISOString().slice(0, 10);
      const dailyPath = path.join(getWorkspaceDailyMemoryPath(), `${dateKey}.md`);
      const existing = readTextFile(dailyPath, '').trim();
      const header = existing ? '\n\n' : '# Daily Memory\n\n';
      const block = [
        `## ${now.toISOString()} | dream`,
        '',
        conversationSummary || '',
        analysis.preferences.length ? `\n### Preferenze rilevate\n${analysis.preferences.map((p) => `- ${p}`).join('\n')}` : '',
        analysis.topics.length ? `\n### Argomenti\n${analysis.topics.map((t) => `- ${t}`).join('\n')}` : '',
      ].filter(Boolean).join('\n');
      writeTextFile(dailyPath, `${existing}${header}${block}\n`, WORKSPACE_FILE_MAX_CHARS);
    }

    // Fix B: aggiorna il marker per la prossima run
    dreamState.lastHistoryLen = chatHistory.length;

    if (chatHistory.length > 2 && personalityPath) {
      const lastUser = chatHistory.filter((m) => m.role === 'user').slice(-1)[0];
      const lastAssistant = chatHistory.filter((m) => m.role === 'assistant').slice(-1)[0];
      updatePersonality(personalityState, lastUser?.text || '', lastAssistant?.text || '');
      savePersonality(personalityPath, personalityState);
    }

    emitSystemChatStream(requestId, 'Dream mode completata. Ho aggiornato note e stato interno.');
  } catch (error) {
    emitSystemChatStream(requestId, `Dream mode terminata con errore: ${error?.message || 'errore sconosciuto'}.`);
  } finally {
    dreamState.isActive = false;
    broadcastStatus();
  }
}

function sendCanvasState(targetWindow = wmGetCanvasWindow()) {
  if (targetWindow && !isRendererUnavailable(targetWindow)) {
    targetWindow.webContents.send('canvas-state', sanitizeForIpc(canvasState));
  }
}

function setBrowserAgentState(patch = {}) {
  browserAgentState = {
    ...browserAgentState,
    ...patch,
    maxSteps: null,
    updatedAt: new Date().toISOString(),
    ...getCurrentBrowserSnapshot(),
  };
  broadcastStatus();
}

function resetBrowserAgentState(patch = {}) {
  browserAgentState = {
    ...createDefaultBrowserAgentState(),
    ...patch,
    updatedAt: patch.updatedAt || new Date().toISOString(),
  };
  broadcastStatus();
}

function createStreamEmitter(requestId) {
  return {
    lastBurstTime: Date.now(),
    emaIntervalMs: 40,
    pendingText: '',
    flushTimer: null,
    queue(text) {
      const delta = String(text || '');
      if (!delta) return;

      const now = Date.now();
      const elapsed = Math.max(1, now - this.lastBurstTime);
      const rawInterval = elapsed / Math.max(1, delta.length);
      this.emaIntervalMs = Math.max(24, Math.min(140, Math.round(0.8 * this.emaIntervalMs + 0.2 * rawInterval * 10)));
      this.lastBurstTime = now;
      this.pendingText += delta;

      if (this.flushTimer) {
        return;
      }

      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, this.emaIntervalMs);
    },
    flush() {
      if (!this.pendingText) return;
      setStreamStatus(STREAM_STATUS.STREAMING);
      emitChatStream({
        type: 'message',
        requestId,
        text: this.pendingText,
      });
      this.pendingText = '';
    },
    stop() {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      this.flush();
    },
  };
}

function broadcastStatus() {
  sendStatusToWindow(wmGetAvatarWindow());
  sendStatusToWindow(wmGetChatWindow());
  sendStatusToWindow(wmGetCanvasWindow());
  sendCanvasState();
}

function getDisplayById(displayId) {
  return screen.getAllDisplays().find((display) => display.id === displayId) || screen.getPrimaryDisplay();
}

function isBoundsVisible(bounds) {
  if (!bounds) return false;

  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    const horizontal = bounds.x < area.x + area.width && bounds.x + bounds.width > area.x;
    const vertical = bounds.y < area.y + area.height && bounds.y + bounds.height > area.y;
    return horizontal && vertical;
  });
}

function getWindowLayout(displayId) {
  const workArea = getDisplayById(displayId).workArea;
  const gap = 24;
  const chatWidth = Math.min(DEFAULT_CHAT_WIDTH, Math.max(400, Math.floor(workArea.width * 0.28)));
  const canvasWidth = Math.min(DEFAULT_CANVAS_WIDTH, Math.max(420, Math.floor(workArea.width * 0.3)));
  const chatHeight = Math.min(
    Math.max(760, Math.floor(workArea.height * 0.82)),
    workArea.height - gap * 2,
  );
  const avatarWidth = Math.min(
    Math.max(760, Math.floor(workArea.width * 0.58)),
    workArea.width - chatWidth - gap * 3,
  );
  const avatarHeight = Math.min(
    Math.max(760, Math.floor(workArea.height * 0.9)),
    workArea.height - gap * 2,
  );

  return {
    avatar: {
      x: workArea.x + Math.max(gap, Math.floor((workArea.width - avatarWidth) / 2)),
      y: workArea.y + Math.max(gap, Math.floor((workArea.height - avatarHeight) / 2)),
      width: avatarWidth,
      height: avatarHeight,
    },
    chat: {
      x: workArea.x + workArea.width - chatWidth - gap,
      y: workArea.y + Math.max(gap, Math.floor((workArea.height - chatHeight) / 2)),
      width: chatWidth,
      height: chatHeight,
    },
    canvas: {
      x: workArea.x + workArea.width - canvasWidth - gap,
      y: workArea.y + gap,
      width: canvasWidth,
      height: workArea.height - gap * 2,
    },
  };
}

function getStoredWindowConfig(key, defaultAlwaysOnTop) {
  const state = readJsonFile(getWindowStatePath(), {});
  const saved = state?.[key];
  const displayId = saved?.displayId || screen.getPrimaryDisplay().id;
  const fallbackBounds = getWindowLayout(displayId)[key];
  const bounds = saved?.bounds && isBoundsVisible(saved.bounds) ? saved.bounds : fallbackBounds;

  return {
    bounds,
    displayId,
    alwaysOnTop: saved?.alwaysOnTop ?? defaultAlwaysOnTop,
  };
}

function serializeWindowState(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return undefined;

  const bounds = targetWindow.getBounds();
  const displayId = screen.getDisplayMatching(bounds).id;

  return {
    bounds,
    displayId,
    alwaysOnTop: targetWindow.isAlwaysOnTop(),
  };
}

function extractStablePreferences(messages) {
  const collected = [];
  for (const message of messages.filter((item) => !isBootstrapHistoryMessage(item))) {
    if (message.role !== 'user') continue;
    const text = normalizeLine(message.text, 180);
    if (!text || !/\b(voglio|usa|usare|deve|non|separa|centr|chat|avatar|nyxavatar|animazioni|gesture|finestr|trasparente|acp|tts|lipsync)\b/i.test(text)) continue;
    collected.push(text);
  }
  return Array.from(new Set(collected)).slice(-12);
}

function extractRecentTopics(messages) {
  const collected = [];
  for (const message of messages.filter((item) => !isBootstrapHistoryMessage(item)).slice(-12)) {
    const text = normalizeLine(message.text, 90);
    if (!text) continue;
    collected.push(text);
  }
  return collected.slice(-8);
}

function buildConversationSummary(messages) {
  return messages
    .filter((item) => !isBootstrapHistoryMessage(item))
    .slice(-10)
    .map((message) => `${message.role}: ${normalizeLine(message.text, 120)}`)
    .join(' | ')
    .slice(0, 1400);
}

function isBootstrapHistoryMessage(message) {
  return Boolean(message?.meta?.bootstrap);
}

function loadPersistentData() {
  ensureUserDataDir();
  chatHistory = readJsonFile(getChatHistoryPath(), []);
  acpSession = readJsonFile(getAcpSessionPath(), createEmptyAcpSession());
  chatSession = readJsonFile(getChatSessionPath(), createEmptyChatSession());
  bootstrapState = readJsonFile(getBootstrapStatePath(), createDefaultBootstrapState());
  canvasState = readJsonFile(getCanvasStatePath(), createDefaultCanvasState());
  nyxMemory = {
    updatedAt: new Date().toISOString(),
    summary: buildConversationSummary(chatHistory),
    stablePreferences: extractStablePreferences(chatHistory),
    recentTopics: extractRecentTopics(chatHistory),
  };
  workspaceState = readWorkspaceState();
}



function schedulePersistWindowState() {
  if (persistWindowStateTimer) {
    clearTimeout(persistWindowStateTimer);
  }

  persistWindowStateTimer = setTimeout(() => {
    persistWindowStateTimer = null;
    try {
      wmPersistWindowStateNow(app, wmGetAvatarWindow(), wmGetChatWindow(), wmGetCanvasWindow());
    } catch {
      // ignore persistence errors
    }
  }, 200);
}

function bindPersistentBounds(targetWindow) {
  targetWindow.on('move', schedulePersistWindowState);
  targetWindow.on('resize', schedulePersistWindowState);
}

function applyAlwaysOnTop(targetWindow, target, enabled) {
  if (!targetWindow || targetWindow.isDestroyed()) return;

  if (target === 'avatar') {
    targetWindow.setAlwaysOnTop(Boolean(enabled), 'screen-saver', 1);
    targetWindow.setVisibleOnAllWorkspaces(Boolean(enabled));
    return;
  }

  targetWindow.setAlwaysOnTop(Boolean(enabled), 'floating', 1);
}

function setWindowAlwaysOnTop(target, enabled) {
  if (target === 'avatar') {
    wmApplyAlwaysOnTop(wmGetAvatarWindow(), target, enabled);
  }

  if (target === 'chat') {
    wmApplyAlwaysOnTop(wmGetChatWindow(), target, enabled);
  }

  if (target === 'canvas') {
    wmApplyAlwaysOnTop(wmGetCanvasWindow(), target, enabled);
  }

  wmSchedulePersistWindowState(app, wmGetAvatarWindow(), wmGetChatWindow(), wmGetCanvasWindow());
  broadcastStatus();

  return {
    ok: true,
    windowPrefs: wmGetCurrentWindowPrefs(wmGetAvatarWindow(), wmGetChatWindow(), wmGetCanvasWindow(), readJsonFile(getWindowStatePath(), {})),
  };
}

function toFileHref(filePath) {
  try {
    return pathToFileURL(filePath).href;
  } catch {
    return '';
  }
}

// ============================================================
// Pywinauto MCP service functions moved to computer-control.js
// Import from computer-control module above
// ============================================================

async function readPywinautoDesktopStateText(preferredState = computerState) {
  const windowTitle = String(preferredState?.foregroundTitle || '').trim();

  try {
    let details = {
      handle: Number.isFinite(Number(preferredState?.foregroundHandle)) ? Number(preferredState.foregroundHandle) : null,
      interactiveElements: Array.isArray(preferredState?.interactiveElements) ? preferredState.interactiveElements : [],
    };

    if (windowTitle && !details.interactiveElements.length) {
      details = await ccReadPywinautoActiveWindowDetails(windowTitle);
    }

    const focusedText = buildPywinautoForegroundText(windowTitle, details.interactiveElements);
    if (focusedText) {
      return {
        text: focusedText,
        status: 'ready',
        error: '',
        source: 'pywinauto-mcp-active-window',
      };
    }

    return {
      text: '',
      status: 'empty',
      error: '',
      source: 'pywinauto-mcp-active-window',
    };
  } catch (error) {
    return {
      text: '',
      status: 'error',
      error: error?.message || String(error),
      source: 'pywinauto-mcp-active-window',
    };
  }
}

function inferCanvasContentTypeFromPath(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov', '.mkv'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext)) return 'audio';
  if (['.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.xml', '.yml', '.yaml', '.log'].includes(ext)) return 'text';
  return 'file';
}

async function buildCanvasContent(content = {}, options = {}) {
  const input = content || {};
  const normalized = {
    type: String(input.type || 'empty').trim().toLowerCase(),
    title: String(input.title || 'Canvas').trim() || 'Canvas',
    value: String(input.value || ''),
    editable: Boolean(input.editable),
    path: input.path ? path.resolve(String(input.path)) : '',
    src: String(input.src || ''),
    url: String(input.url || ''),
    currentUrl: String(input.currentUrl || ''),
    pageTitle: String(input.pageTitle || ''),
    tabId: String(input.tabId || ''),
    mimeType: String(input.mimeType || ''),
    entries: Array.isArray(input.entries) ? input.entries : [],
    tabs: Array.isArray(input.tabs) ? input.tabs : [],
    text: String(input.text || ''),
    snapshotText: String(input.snapshotText || ''),
    snapshotItems: Array.isArray(input.snapshotItems) ? input.snapshotItems : [],
    screenshotSrc: String(input.screenshotSrc || ''),
    status: String(input.status || ''),
    message: String(input.message || ''),
    lastUpdatedAt: input.lastUpdatedAt || null,
  };

  if (normalized.type === 'browser') {
    return baResolveBrowserCanvasContent(normalized, options.browser || {});
  }

  if (normalized.path) {
    try {
      const stats = await fs.stat(normalized.path);
      if (stats.isDirectory()) {
        normalized.type = 'files';
        normalized.title = normalized.title || path.basename(normalized.path) || normalized.path;
        const entries = await fs.readdir(normalized.path, { withFileTypes: true });
        normalized.entries = entries
          .map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? 'dir' : 'file',
            path: path.join(normalized.path, entry.name),
          }))
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
          .slice(0, 300);
      } else if (stats.isFile()) {
        const inferredType = inferCanvasContentTypeFromPath(normalized.path);
        normalized.title = normalized.title || path.basename(normalized.path);
        if (['image', 'video', 'audio'].includes(inferredType)) {
          normalized.type = inferredType;
          normalized.src = toFileHref(normalized.path);
        } else {
          normalized.type = 'text';
          normalized.editable = normalized.editable || false;
          normalized.value = await fs.readFile(normalized.path, 'utf8').catch(() => normalized.path);
        }
      }
    } catch {
      normalized.type = normalized.type === 'empty' ? 'text' : normalized.type;
      normalized.value = normalized.value || `Path non accessibile: ${normalized.path}`;
    }
  }

  if (normalized.src && ['image', 'video', 'audio'].includes(normalized.type) && !/^https?:|^file:/i.test(normalized.src)) {
    normalized.src = toFileHref(path.resolve(normalized.src));
  }

  if (normalized.type === 'clipboard') {
    normalized.editable = true;
  }

  return normalized;
}

async function refreshBrowserCanvas(overrides = {}, options = {}) {
  const baseContent = canvasState.content?.type === 'browser'
    ? canvasState.content
    : {
      type: 'browser',
      title: 'Browser',
      url: '',
    };

  const content = await buildCanvasContent(
    {
      ...baseContent,
      ...overrides,
      type: 'browser',
    },
    {
      browser: {
        navigate: options.navigate !== false,
      },
    },
  );

  updateCanvasState({
    isOpen: options.showCanvas === true ? true : canvasState.isOpen,
    content,
  });

  return {
    ok: content.status !== 'error',
    state: canvasState,
    error: content.status === 'error' ? content.message : null,
  };
}

async function navigateBrowserCanvas(overrides = {}) {
  if (canvasState.isOpen) {
    closeCanvas();
  }

  const result = await refreshBrowserCanvas({
    ...(canvasState.content?.type === 'browser' ? canvasState.content : {}),
    type: 'browser',
    ...overrides,
  }, { navigate: true, showCanvas: false });

  const browserContent = result?.state?.content || canvasState.content;
  return {
    ok: browserContent?.status !== 'error',
    state: result?.state || canvasState,
    error: browserContent?.status === 'error' ? browserContent.message : null,
  };
}

function updateCanvasState(patch = {}) {
  canvasState = {
    ...canvasState,
    ...patch,
  };

  persistCanvasState();
  sendCanvasState();
  broadcastStatus();
}



function syncCanvasToAvatar(layout = canvasState.layout) {
  const canvasWin = wmGetCanvasWindow();
  const avatarWin = wmGetAvatarWindow();
  if (!canvasWin || canvasWin.isDestroyed()) return;
  if (!avatarWin || avatarWin.isDestroyed()) return;
  if (!canvasState.isOpen) return;

  const normalizedLayout = baNormalizeCanvasLayout(layout);
  const nextBounds = wmGetCanvasBoundsForLayout(normalizedLayout, avatarWin.getBounds());

  if (normalizedLayout === 'split-50') {
    avatarWin.setBounds(nextBounds.avatar);
  } else if (canvasState.lastAvatarBoundsBeforeSplit && avatarWin && !avatarWin.isDestroyed()) {
    canvasState.lastAvatarBoundsBeforeSplit = null;
  }

  canvasWin.setBounds(nextBounds.canvas);
}

async function openCanvas(options = {}) {
  if (!ENABLE_LIVE_CANVAS) {
    updateCanvasState({
      isOpen: false,
      lastAvatarBoundsBeforeSplit: null,
    });
    const canvasWin = wmGetCanvasWindow();
    if (canvasWin && !canvasWin.isDestroyed()) {
      canvasWin.hide();
    }
    return { ok: true, disabled: true, state: canvasState };
  }

  const layout = baNormalizeCanvasLayout(options.layout || canvasState.layout);
  const content = await buildCanvasContent(options.content || canvasState.content || {}, options.buildOptions || {});
  const wasOpen = canvasState.isOpen;
  ensureWindows();
  let avatarWin = wmGetAvatarWindow();

  if (!avatarWin || avatarWin.isDestroyed()) {
    return { ok: false, error: 'Avatar window non disponibile' };
  }

  if (canvasState.layout === 'split-50' && layout !== 'split-50' && canvasState.lastAvatarBoundsBeforeSplit && avatarWin && !avatarWin.isDestroyed()) {
    avatarWin.setBounds(canvasState.lastAvatarBoundsBeforeSplit);
    canvasState.lastAvatarBoundsBeforeSplit = null;
  }

  if (layout === 'split-50' && avatarWin && !avatarWin.isDestroyed() && !canvasState.lastAvatarBoundsBeforeSplit) {
    canvasState.lastAvatarBoundsBeforeSplit = avatarWin.getBounds();
  }

  updateCanvasState({
    isOpen: true,
    layout,
    content,
    lastAvatarBoundsBeforeSplit: canvasState.lastAvatarBoundsBeforeSplit,
  });

  ensureWindows();
  const canvasWin = wmGetCanvasWindow();
  avatarWin = wmGetAvatarWindow();
  const chatWin = wmGetChatWindow();

  if (!canvasWin || canvasWin.isDestroyed()) {
    return { ok: false, error: 'Canvas window non disponibile' };
  }

  syncCanvasToAvatar(layout);
  wmApplyAlwaysOnTop(canvasWin, 'canvas', wmGetCurrentWindowPrefs(avatarWin, chatWin, canvasWin, {}).canvasAlwaysOnTop);

  if (!wasOpen) {
    canvasWin.show();
  } else {
    canvasWin.showInactive();
  }

  canvasWin.focus();

  return { ok: true, state: canvasState };
}

function closeCanvas() {
  const avatarWin = wmGetAvatarWindow();
  const canvasWin = wmGetCanvasWindow();
  if (canvasState.layout === 'split-50' && canvasState.lastAvatarBoundsBeforeSplit && avatarWin && !avatarWin.isDestroyed()) {
    avatarWin.setBounds(canvasState.lastAvatarBoundsBeforeSplit);
  }

  updateCanvasState({
    isOpen: false,
    lastAvatarBoundsBeforeSplit: null,
  });

  if (canvasWin && !canvasWin.isDestroyed()) {
    canvasWin.hide();
  }

  return { ok: true, state: canvasState };
}

async function handleCanvasDirective(directive = {}) {
  if (!ENABLE_LIVE_CANVAS) {
    closeCanvas();
    return { ok: true, disabled: true, state: canvasState };
  }

  const action = String(directive.action || 'open').trim().toLowerCase();

  if (action === 'close' || action === 'hide') {
    return closeCanvas();
  }

  if (action === 'clipboard-read') {
    return openCanvas({
      layout: directive.layout || canvasState.layout,
      content: {
        type: 'clipboard',
        title: directive.title || 'Clipboard',
        value: clipboard.readText() || '',
        editable: true,
      },
    });
  }

  return openCanvas({
    layout: directive.layout || canvasState.layout,
    content: directive.content || directive,
  });
}

async function handleBrowserDirective(directive = {}) {
  const action = String(directive.action || 'refresh').trim().toLowerCase();

  if (['open', 'show', 'navigate'].includes(action)) {
    const targetUrl = directive.url || directive.value || canvasState.content?.currentUrl || canvasState.content?.url || '';
    return navigateBrowserCanvas({
      title: directive.title || baBuildBrowserTitleFromUrl(targetUrl),
      url: targetUrl,
    });
  }

  if (action === 'refresh') {
    return refreshBrowserCanvas({}, { navigate: false, showCanvas: false });
  }

  return baPerformBrowserAction({
    kind: directive.kind || action,
    ref: directive.ref,
    text: directive.text,
    value: directive.value,
    key: directive.key,
    waitNav: directive.waitNav,
    waitAfterMs: directive.waitAfterMs,
  }, canvasState, refreshBrowserCanvas);
}

function updateComputerState(patch = {}) {
  computerState = {
    ...computerState,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  broadcastStatus();
}

async function readComputerScreenshotText(targetPath) {
  return readPywinautoDesktopStateText();
}

async function captureComputerScreenshotWithOcr(targetPath, region = '') {
  const screenshot = await captureComputerScreenshot(targetPath, region);
  const ocr = await readComputerScreenshotText(screenshot?.path || targetPath);
  return {
    ...screenshot,
    ocrText: ocr.text,
    ocrStatus: ocr.status,
    ocrError: ocr.error,
    readSource: ocr.source || 'ocr',
  };
}

function buildComputerOcrNote(ocr = {}) {
  if (ocr?.status === 'ready') {
    return `Lettura desktop disponibile${ocr?.source ? ` via ${ocr.source}` : ''}.`;
  }

  if (ocr?.status === 'empty') {
    return 'Nessun testo strutturato disponibile dal backend desktop.';
  }

  if (ocr?.status === 'error') {
    return `Lettura desktop fallita: ${normalizeLine(ocr.error, 140)}`;
  }

  return '';
}

function getComputerForegroundRegion(state = computerState, padding = 10) {
  const bounds = state?.foregroundBounds;
  if (!bounds) {
    return '';
  }

  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return '';
  }

  const inset = Math.max(0, Math.round(Number(padding || 0)));
  const nextX = Math.round(x + inset);
  const nextY = Math.round(y + inset);
  const nextWidth = Math.max(1, Math.round(width - (inset * 2)));
  const nextHeight = Math.max(1, Math.round(height - (inset * 2)));
  return `${nextX},${nextY},${nextWidth},${nextHeight}`;
}

function getComputerCaptureDir() {
  const captureDir = path.join(app.getPath('userData'), 'computer-captures');
  fs.mkdirSync(captureDir, { recursive: true });
  return captureDir;
}

function buildComputerScreenshotRegionScript(region = '') {
  const normalizedRegion = String(region || '').trim();
  if (!normalizedRegion) {
    return '[System.Windows.Forms.SystemInformation]::VirtualScreen';
  }

  const parts = normalizedRegion.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new Error('screenshot region deve essere x,y,width,height.');
  }

  return `New-Object System.Drawing.Rectangle(${Math.round(parts[0])}, ${Math.round(parts[1])}, ${Math.round(parts[2])}, ${Math.round(parts[3])})`;
}

async function captureComputerScreenshot(targetPath, region = '') {
  const resolvedPath = String(targetPath || '').trim()
    || path.join(getComputerCaptureDir(), `desktop-${Date.now()}.png`);
  const regionScript = buildComputerScreenshotRegionScript(region);

  return runPowerShellJson(`
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$targetPath = ${JSON.stringify(resolvedPath)}
$bounds = ${regionScript}
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
[pscustomobject]@{
  ok = $true
  path = $targetPath
  width = $bounds.Width
  height = $bounds.Height
} | ConvertTo-Json -Compress
`);
}

function buildComputerVerificationShotPath(actionSummary = '') {
  const label = String(actionSummary || 'step')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'step';
  return path.join(getComputerCaptureDir(), `verify-${Date.now()}-${label}.png`);
}

function buildPowerShellEncodedCommand(script = '') {
  return Buffer.from(String(script || ''), 'utf16le').toString('base64');
}

function decodePowerShellCliXml(text = '') {
  const source = String(text || '').trim();
  if (!source) return '';

  if (!source.includes('#< CLIXML')) {
    return source;
  }

  const errorChunks = [...source.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)]
    .map((match) => String(match[1] || ''))
    .filter(Boolean);

  const raw = errorChunks.length ? errorChunks.join(' ') : source;
  return raw
    .replace(/_x000D__x000A_/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function runPowerShellJson(script = '', options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-STA',
      '-EncodedCommand',
      buildPowerShellEncodedCommand(script),
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || COMPUTER_ACTION_TIMEOUT_MS));
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // ignore timeout kill errors
      }
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      const output = String(stdout || '').trim();
      if (code !== 0) {
        reject(new Error(decodePowerShellCliXml(String(stderr || output || `PowerShell exited with code ${code}`))));
        return;
      }

      if (!output) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error(`Invalid PowerShell JSON output: ${output}`));
      }
    });
  });
}

function buildComputerPowerShellPrelude() {
  return `
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public struct POINT {
  public int X;
  public int Y;
}

public struct RECT {
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}

public class NyxComputerWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  [DllImport("user32.dll")]
  public static extern bool GetCursorPos(out POINT lpPoint);

  [DllImport("user32.dll")]
  public static extern int GetSystemMetrics(int nIndex);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool BringWindowToTop(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
"@
`;
}

function buildComputerWindowsStateScript(limit = 10) {
  return `
${buildComputerPowerShellPrelude()}
$foreground = [NyxComputerWin32]::GetForegroundWindow()
$foregroundTitle = ''
$foregroundProcess = ''
$foregroundBounds = $null
$windows = New-Object System.Collections.Generic.List[object]
[NyxComputerWin32]::EnumWindows({
  param([IntPtr] $hwnd, [IntPtr] $lParam)
  if (-not [NyxComputerWin32]::IsWindowVisible($hwnd)) { return $true }
  $builder = New-Object System.Text.StringBuilder 512
  [void][NyxComputerWin32]::GetWindowText($hwnd, $builder, $builder.Capacity)
  $title = $builder.ToString().Trim()
  if (-not $title) { return $true }
[uint32] $procId = 0
[void][NyxComputerWin32]::GetWindowThreadProcessId($hwnd, [ref] $procId)
$processName = ''
try {
  $processName = (Get-Process -Id $procId -ErrorAction Stop).ProcessName
} catch {
  $processName = ''
}
  if ($hwnd -eq $foreground) {
    $script:foregroundTitle = $title
    $script:foregroundProcess = $processName
    $rect = New-Object RECT
    if ([NyxComputerWin32]::GetWindowRect($hwnd, [ref] $rect)) {
      $width = [Math]::Max(0, $rect.Right - $rect.Left)
      $height = [Math]::Max(0, $rect.Bottom - $rect.Top)
      if ($width -gt 0 -and $height -gt 0) {
        $script:foregroundBounds = [pscustomobject]@{
          x = $rect.Left
          y = $rect.Top
          width = $width
          height = $height
        }
      }
    }
  }
  $windows.Add([pscustomobject]@{
    title = $title
    process = $processName
    pid = [int] $procId
  })
  return $true
}, [IntPtr]::Zero) | Out-Null
$point = New-Object POINT
[void][NyxComputerWin32]::GetCursorPos([ref] $point)
[pscustomobject]@{
  ok = $true
  foregroundTitle = $foregroundTitle
  foregroundProcess = $foregroundProcess
  foregroundBounds = $foregroundBounds
  cursorX = $point.X
  cursorY = $point.Y
  windows = @($windows | Select-Object -First ${Math.max(1, Math.min(20, limit))})
} | ConvertTo-Json -Depth 5 -Compress
`;
}

async function refreshComputerState() {
  if (process.platform !== 'win32') {
    updateComputerState({
      supported: false,
      error: 'computer_use supportato solo su Windows.',
    });
    return computerState;
  }

  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const cursor = screen.getCursorScreenPoint();
    const state = await runPowerShellJson(buildComputerWindowsStateScript(12));
    const pywinautoDetails = await ccReadPywinautoActiveWindowDetails(String(state?.foregroundTitle || '').trim());
    updateComputerState({
      supported: true,
      width: Number(primaryDisplay?.size?.width || 0),
      height: Number(primaryDisplay?.size?.height || 0),
      cursorX: Number(state?.cursorX ?? cursor.x ?? 0),
      cursorY: Number(state?.cursorY ?? cursor.y ?? 0),
      foregroundTitle: String(state?.foregroundTitle || '').trim(),
      foregroundProcess: String(state?.foregroundProcess || '').trim(),
      foregroundHandle: Number.isFinite(Number(pywinautoDetails.handle)) ? Number(pywinautoDetails.handle) : null,
      foregroundBounds: state?.foregroundBounds && Number.isFinite(Number(state.foregroundBounds.width)) && Number.isFinite(Number(state.foregroundBounds.height))
        ? {
          x: Number(state.foregroundBounds.x || 0),
          y: Number(state.foregroundBounds.y || 0),
          width: Number(state.foregroundBounds.width || 0),
          height: Number(state.foregroundBounds.height || 0),
        }
        : null,
      windows: Array.isArray(state?.windows) ? state.windows.slice(0, 12) : [],
      interactiveElements: Array.isArray(pywinautoDetails.interactiveElements) ? pywinautoDetails.interactiveElements : [],
      error: '',
    });
  } catch (error) {
    updateComputerState({
      supported: true,
      error: error?.message || String(error),
    });
  }

  return computerState;
}

function buildComputerStatePrompt() {
  if (!computerState.supported) {
    return 'ACTIVE_COMPUTER:\nSUPPORTED: no';
  }

  const windowLines = (computerState.windows || [])
    .slice(0, 10)
    .map((item) => `- ${normalizeLine(item.title, 80)}${item.process ? ` | ${item.process}` : ''}`)
    .join('\n');
  const foregroundBounds = computerState.foregroundBounds
    && Number.isFinite(Number(computerState.foregroundBounds.width))
    && Number.isFinite(Number(computerState.foregroundBounds.height))
    ? `${Math.round(Number(computerState.foregroundBounds.x || 0))},${Math.round(Number(computerState.foregroundBounds.y || 0))},${Math.round(Number(computerState.foregroundBounds.width || 0))},${Math.round(Number(computerState.foregroundBounds.height || 0))}`
    : '';
  const interactiveElementLines = (computerState.interactiveElements || [])
    .slice(0, 12)
    .map((item) => {
      const parts = [
        `controlId=${item.controlId}`,
        item.elementType || '',
        item.title ? `"${normalizeLine(item.title, 48)}"` : '',
        item.autoId ? `autoId=${normalizeLine(item.autoId, 32)}` : '',
        item.className ? `class=${normalizeLine(item.className, 24)}` : '',
      ].filter(Boolean);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');

  return [
    'ACTIVE_COMPUTER:',
    'SUPPORTED: yes',
    `DESKTOP_BACKEND: ${computerState.desktopBackend || 'native'}`,
    `PRIMARY_SCREEN: ${computerState.width || 0}x${computerState.height || 0}`,
    `CURSOR: ${computerState.cursorX || 0},${computerState.cursorY || 0}`,
    `FOREGROUND_WINDOW: ${computerState.foregroundTitle || '-'}`,
    computerState.foregroundProcess ? `FOREGROUND_PROCESS: ${computerState.foregroundProcess}` : '',
    Number.isFinite(Number(computerState.foregroundHandle)) ? `FOREGROUND_HANDLE: ${computerState.foregroundHandle}` : '',
    foregroundBounds ? `FOREGROUND_BOUNDS: ${foregroundBounds}` : '',
    windowLines ? `VISIBLE_WINDOWS:\n${windowLines}` : 'VISIBLE_WINDOWS:\n- none',
    interactiveElementLines ? `INTERACTIVE_ELEMENTS:\n${interactiveElementLines}` : '',
    computerState.lastAction ? `LAST_ACTION: ${computerState.lastAction}` : '',
    computerState.lastResult ? `LAST_RESULT: ${normalizeLine(computerState.lastResult, 220)}` : '',
    computerState.lastScreenshotPath ? `LAST_SCREENSHOT: ${computerState.lastScreenshotPath}` : '',
    computerState.lastReadSource ? `LAST_READ_SOURCE: ${computerState.lastReadSource}` : '',
    `OCR_STATUS: ${computerState.ocrStatus || 'idle'}`,
    computerState.lastScreenshotText ? `LAST_SCREENSHOT_TEXT:\n${computerState.lastScreenshotText}` : '',
    computerState.error ? `ERROR: ${normalizeLine(computerState.error, 220)}` : '',
  ].filter(Boolean).join('\n');
}

function getComputerObservationSnapshot(state = computerState) {
  return {
    foregroundTitle: String(state?.foregroundTitle || '').trim(),
    foregroundProcess: String(state?.foregroundProcess || '').trim(),
    foregroundHandle: Number(state?.foregroundHandle || 0),
    cursorX: Number(state?.cursorX || 0),
    cursorY: Number(state?.cursorY || 0),
    windowsSignature: (Array.isArray(state?.windows) ? state.windows : [])
      .slice(0, 12)
      .map((item) => `${String(item?.title || '').trim()}|${String(item?.process || '').trim()}`)
      .join('\n'),
    interactiveElementsSignature: (Array.isArray(state?.interactiveElements) ? state.interactiveElements : [])
      .slice(0, 12)
      .map((item) => `${String(item?.controlId || '')}|${String(item?.title || '')}|${String(item?.elementType || '')}`)
      .join('\n'),
  };
}

function buildComputerObservationNote(beforeState, afterState) {
  const before = getComputerObservationSnapshot(beforeState);
  const after = getComputerObservationSnapshot(afterState);

  if (after.foregroundTitle && (
    after.foregroundTitle !== before.foregroundTitle
    || after.foregroundProcess !== before.foregroundProcess
  )) {
    return `Focus ora su ${after.foregroundTitle}${after.foregroundProcess ? ` | ${after.foregroundProcess}` : ''}.`;
  }

  if (after.windowsSignature && after.windowsSignature !== before.windowsSignature) {
    return 'Rilevato cambiamento nelle finestre visibili.';
  }

  if (after.interactiveElementsSignature && after.interactiveElementsSignature !== before.interactiveElementsSignature) {
    return 'Rilevato cambiamento nei controlli della finestra attiva.';
  }

  if (after.cursorX !== before.cursorX || after.cursorY !== before.cursorY) {
    return `Cursore ora su ${after.cursorX},${after.cursorY}.`;
  }

  return 'Nessun cambiamento visibile rilevato.';
}

function summarizeComputerActionResult(action, directive, result, beforeState, afterState) {
  const note = buildComputerObservationNote(beforeState, afterState);
  const title = String(afterState?.foregroundTitle || '').trim();

  if (action === 'focus_window') {
    if (result?.title && title && title.toLowerCase().includes(String(result.title).toLowerCase())) {
      return `Focus spostato su ${title}.`;
    }
    return title
      ? `Tentata attivazione finestra. Focus attuale: ${title}.`
      : 'Tentata attivazione finestra.';
  }

  if (action === 'mouse_move') {
    return `Mouse spostato. ${note}`;
  }

  if (action === 'mouse_click') {
    return `${String(directive?.button || 'left').trim().toLowerCase()} click inviato. ${note}`;
  }

  if (action === 'mouse_down') {
    return `${String(directive?.button || 'left').trim().toLowerCase()} mouse down inviato. ${note}`;
  }

  if (action === 'mouse_up') {
    return `${String(directive?.button || 'left').trim().toLowerCase()} mouse up inviato. ${note}`;
  }

  if (action === 'type_text') {
    return `Testo inviato. ${note}`;
  }

  if (action === 'key_press') {
    return `Tasto inviato. ${note}`;
  }

  if (action === 'hotkey') {
    return `Hotkey inviata. ${note}`;
  }

  if (action === 'open_app' || action === 'launch' || action === 'open') {
    const appTarget = String(directive?.app || directive?.path || directive?.target || '').trim();
    if (title && note !== 'Nessun cambiamento visibile rilevato.') {
      return `Richiesta apertura inviata per ${appTarget}. ${note}`;
    }
    return `Richiesta apertura inviata per ${appTarget}. Nessuna nuova finestra visibile rilevata.`;
  }

  return note;
}

function escapeSendKeysLiteral(text = '') {
  const replacements = {
    '+': '{+}',
    '^': '{^}',
    '%': '{%}',
    '~': '{~}',
    '(': '{(}',
    ')': '{)}',
    '[': '{[}',
    ']': '{]}',
    '{': '{{}',
    '}': '{}}',
  };

  return String(text || '')
    .split('')
    .map((char) => replacements[char] || char)
    .join('');
}

function convertHotkeyComboToSendKeys(combo = '') {
  const parts = String(combo || '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return '';
  }

  const key = parts.pop();
  const prefix = parts.map((part) => {
    const normalized = part.toLowerCase();
    if (['ctrl', 'control'].includes(normalized)) return '^';
    if (normalized === 'shift') return '+';
    if (normalized === 'alt') return '%';
    return '';
  }).join('');

  const normalizedKey = String(key || '').trim().toLowerCase();
  const namedKeys = {
    enter: '{ENTER}',
    return: '{ENTER}',
    invio: '{ENTER}',
    tab: '{TAB}',
    esc: '{ESC}',
    escape: '{ESC}',
    delete: '{DEL}',
    del: '{DEL}',
    backspace: '{BACKSPACE}',
    space: ' ',
    up: '{UP}',
    down: '{DOWN}',
    left: '{LEFT}',
    right: '{RIGHT}',
    home: '{HOME}',
    end: '{END}',
    pageup: '{PGUP}',
    pagedown: '{PGDN}',
  };

  const keyToken = namedKeys[normalizedKey]
    || (/^f\d{1,2}$/i.test(key) ? `{${key.toUpperCase()}}` : escapeSendKeysLiteral(key));

  return `${prefix}${keyToken}`;
}

function normalizeComputerModifiers(modifiers = []) {
  const next = Array.isArray(modifiers) ? modifiers : [];
  return next
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
}

function buildSendKeysKeyToken(key = '') {
  const normalizedKey = String(key || '').trim().toLowerCase();
  if (!normalizedKey) {
    return '';
  }

  const namedKeys = {
    enter: '{ENTER}',
    return: '{ENTER}',
    invio: '{ENTER}',
    tab: '{TAB}',
    esc: '{ESC}',
    escape: '{ESC}',
    delete: '{DEL}',
    del: '{DEL}',
    backspace: '{BACKSPACE}',
    space: ' ',
    up: '{UP}',
    down: '{DOWN}',
    left: '{LEFT}',
    right: '{RIGHT}',
    home: '{HOME}',
    end: '{END}',
    pageup: '{PGUP}',
    pagedown: '{PGDN}',
  };

  return namedKeys[normalizedKey]
    || (/^f\d{1,2}$/i.test(key) ? `{${key.toUpperCase()}}` : escapeSendKeysLiteral(key));
}

function buildSendKeysCombo(key = '', modifiers = []) {
  const prefix = normalizeComputerModifiers(modifiers).map((part) => {
    if (['ctrl', 'control'].includes(part)) return '^';
    if (part === 'shift') return '+';
    if (part === 'alt') return '%';
    return '';
  }).join('');
  const keyToken = buildSendKeysKeyToken(key);
  return keyToken ? `${prefix}${keyToken}` : '';
}

function summarizeComputerDirective(payload = {}) {
  const action = String(payload.action || payload.kind || '').trim().toLowerCase();
  if (!action) return 'computer action';

  if (action === 'focus_window') {
    return payload.titleContains || payload.title
      ? `focus ${payload.titleContains || payload.title}`
      : `focus ${payload.processName || payload.process || 'window'}`;
  }

  if (action === 'mouse_move') {
    return Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y))
      ? `move mouse to ${Math.round(Number(payload.x))},${Math.round(Number(payload.y))}`
      : 'move mouse';
  }

  if (action === 'mouse_click' || action === 'mouse_down' || action === 'mouse_up') {
    const button = String(payload.button || 'left').trim().toLowerCase();
    if (payload.controlId !== undefined && payload.controlId !== null) {
      return `${action} control ${payload.controlId}`;
    }
    const coords = Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y))
      ? ` @ ${Math.round(Number(payload.x))},${Math.round(Number(payload.y))}`
      : '';
    return `${action} ${button}${coords}`;
  }

  if (action === 'type_text') {
    if (payload.controlId !== undefined && payload.controlId !== null) {
      return `type into control ${payload.controlId}`;
    }
    return `type ${normalizeLine(String(payload.text || ''), 48)}`;
  }

  if (action === 'key_press') {
    const modifiers = normalizeComputerModifiers(payload.modifiers);
    const key = String(payload.key || '').trim();
    return `key ${[...modifiers, key].filter(Boolean).join('+')}`.trim();
  }

  if (action === 'hotkey') {
    return `hotkey ${String(payload.combo || payload.keys || '').trim()}`.trim();
  }

  if (action === 'open_app' || action === 'launch' || action === 'open') {
    return `open ${String(payload.app || payload.path || payload.target || '').trim()}`.trim();
  }

  if (action === 'screenshot') {
    return 'take screenshot';
  }

  return action;
}

async function performComputerAction(payload = {}) {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'computer_use supportato solo su Windows.' };
  }

  const action = String(payload.action || payload.kind || '').trim().toLowerCase();
  if (!action) {
    return { ok: false, error: 'Missing computer action.' };
  }

  if (action === 'focus_window') {
    const titleContains = String(payload.titleContains || payload.title || '').trim();
    const processName = String(payload.processName || payload.process || '').trim();
    if (!titleContains && !processName) {
      return { ok: false, error: 'focus_window richiede titleContains o processName.' };
    }

    if (titleContains) {
      try {
        const lookup = await ccCallPywinautoTool('automation_windows', {
          operation: 'find',
          title: titleContains,
        });
        const candidates = Array.isArray(lookup?.windows) ? lookup.windows : [];
        const focused = candidates.find((item) => Number.isFinite(Number(item?.handle)));
        if (focused?.handle) {
          const focusResult = await ccCallPywinautoTool('automation_windows', {
            operation: 'focus',
            handle: Number(focused.handle),
          });
          await refreshComputerState().catch(() => null);
          updateComputerState({
            desktopBackend: 'pywinauto-mcp',
            lastAction: `focus_window ${titleContains}`,
            lastResult: focusResult?.status === 'success'
              ? `Finestra attivata via pywinauto-mcp: ${focused.title || titleContains}`
              : `Tentata attivazione via pywinauto-mcp: ${focused.title || titleContains}`,
            error: '',
          });
          return {
            ok: true,
            title: focused.title || titleContains,
            process: focused.process || '',
            backend: 'pywinauto-mcp',
          };
        }
      } catch (error) {
        appendPywinautoMcpLog(error.message || String(error), 'focus-fallback');
      }
    }

    const result = await runPowerShellJson(`
${buildComputerPowerShellPrelude()}
$titleFilter = ${JSON.stringify(titleContains.toLowerCase())}
$processFilter = ${JSON.stringify(processName.toLowerCase())}
$match = $null
[NyxComputerWin32]::EnumWindows({
  param([IntPtr] $hwnd, [IntPtr] $lParam)
  if (-not [NyxComputerWin32]::IsWindowVisible($hwnd)) { return $true }
  $builder = New-Object System.Text.StringBuilder 512
  [void][NyxComputerWin32]::GetWindowText($hwnd, $builder, $builder.Capacity)
  $title = $builder.ToString().Trim()
  if (-not $title) { return $true }
  [uint32] $procId = 0
  [void][NyxComputerWin32]::GetWindowThreadProcessId($hwnd, [ref] $procId)
  $processName = ''
  try {
    $processName = (Get-Process -Id $procId -ErrorAction Stop).ProcessName
  } catch {
    $processName = ''
  }
  if ($titleFilter -and -not $title.ToLower().Contains($titleFilter)) { return $true }
  if ($processFilter -and -not $processName.ToLower().Contains($processFilter)) { return $true }
  $script:match = [pscustomobject]@{
    hwnd = $hwnd.ToInt64()
    title = $title
    process = $processName
    pid = [int] $procId
  }
  return $false
}, [IntPtr]::Zero) | Out-Null
if (-not $match) {
  throw "No visible window matched the requested filter."
}
$handle = [IntPtr]::new([int64]$match.hwnd)
[NyxComputerWin32]::ShowWindow($handle, 9) | Out-Null
Start-Sleep -Milliseconds 120
[NyxComputerWin32]::BringWindowToTop($handle) | Out-Null
$activated = [NyxComputerWin32]::SetForegroundWindow($handle)
if (-not $activated) {
  try {
    $wshell = New-Object -ComObject WScript.Shell
    [void]$wshell.AppActivate($match.title)
    Start-Sleep -Milliseconds 120
    $activated = [NyxComputerWin32]::SetForegroundWindow($handle)
  } catch {
    $activated = $false
  }
}
    [pscustomobject]@{
  ok = $true
  activated = [bool]$activated
  title = $match.title
  process = $match.process
  pid = $match.pid
} | ConvertTo-Json -Depth 4 -Compress
`);

    await refreshComputerState().catch(() => null);
    updateComputerState({
      lastAction: `focus_window ${titleContains || processName}`,
      lastResult: result?.title ? `Finestra attiva: ${result.title}` : 'Finestra attivata.',
      error: '',
    });
    return result;
  }

  if (action === 'mouse_move') {
    const x = Number(payload.x);
    const y = Number(payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, error: 'mouse_move richiede x e y.' };
    }

    const durationMs = Math.max(0, Number(payload.durationMs || 0));
    const result = await runPowerShellJson(`
${buildComputerPowerShellPrelude()}
$targetX = ${Math.round(x)}
$targetY = ${Math.round(y)}
$durationMs = ${Math.round(durationMs)}
if ($durationMs -gt 0) {
  $point = New-Object POINT
  [void][NyxComputerWin32]::GetCursorPos([ref] $point)
  $startX = $point.X
  $startY = $point.Y
  $steps = [Math]::Max(1, [Math]::Min(60, [int]($durationMs / 16)))
  for ($index = 1; $index -le $steps; $index++) {
    $ratio = $index / $steps
    $nextX = [int][Math]::Round($startX + (($targetX - $startX) * $ratio))
    $nextY = [int][Math]::Round($startY + (($targetY - $startY) * $ratio))
    [void][NyxComputerWin32]::SetCursorPos($nextX, $nextY)
    Start-Sleep -Milliseconds ([Math]::Max(1, [int]($durationMs / $steps)))
  }
} else {
  [void][NyxComputerWin32]::SetCursorPos($targetX, $targetY)
}
[pscustomobject]@{ ok = $true; x = $targetX; y = $targetY } | ConvertTo-Json -Compress
`);

    await refreshComputerState().catch(() => null);
    updateComputerState({
      cursorX: Math.round(x),
      cursorY: Math.round(y),
      lastAction: `mouse_move ${Math.round(x)},${Math.round(y)}`,
      lastResult: 'Mouse spostato.',
      error: '',
    });
    return result;
  }

  if (action === 'mouse_click') {
    const button = String(payload.button || 'left').trim().toLowerCase();
    const clicks = Math.max(1, Number(payload.clicks || 1));
    const controlId = payload.controlId;
    const foregroundHandle = Number(computerState.foregroundHandle || 0);
    if (controlId !== undefined && controlId !== null && Number.isFinite(foregroundHandle) && foregroundHandle > 0) {
      try {
        const operation = button === 'right'
          ? 'right_click'
          : (clicks > 1 ? 'double_click' : 'click');
        const result = await ccCallPywinautoTool('automation_elements', {
          operation,
          window_handle: foregroundHandle,
          control_id: controlId,
          button,
        });
        await refreshComputerState().catch(() => null);
        updateComputerState({
          desktopBackend: 'pywinauto-mcp',
          lastAction: `mouse_click control ${controlId}`,
          lastResult: `Click inviato via pywinauto-mcp su control ${controlId}.`,
          error: '',
        });
        return {
          ok: true,
          ...result,
          backend: 'pywinauto-mcp',
        };
      } catch (error) {
        appendPywinautoMcpLog(error.message || String(error), 'click-fallback');
      }
    }
    const hasCoords = Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y));
    const x = hasCoords ? Math.round(Number(payload.x)) : null;
    const y = hasCoords ? Math.round(Number(payload.y)) : null;
    const mouseFlags = {
      left: [2, 4],
      right: [8, 16],
      middle: [32, 64],
    };
    const flags = mouseFlags[button];
    if (!flags) {
      return { ok: false, error: `Mouse button non supportato: ${button}` };
    }

    const result = await runPowerShellJson(`
${buildComputerPowerShellPrelude()}
$downFlag = [uint32] ${flags[0]}
$upFlag = [uint32] ${flags[1]}
${hasCoords ? `[void][NyxComputerWin32]::SetCursorPos(${x}, ${y})` : ''}
for ($i = 0; $i -lt ${Math.round(clicks)}; $i++) {
  [NyxComputerWin32]::mouse_event($downFlag, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [NyxComputerWin32]::mouse_event($upFlag, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
}
[pscustomobject]@{ ok = $true; button = ${JSON.stringify(button)}; clicks = ${Math.round(clicks)} } | ConvertTo-Json -Compress
`);

    await refreshComputerState().catch(() => null);
    updateComputerState({
      ...(hasCoords ? { cursorX: x, cursorY: y } : {}),
      lastAction: `mouse_click ${button}${hasCoords ? ` @ ${x},${y}` : ''}`,
      lastResult: `${button} click eseguito.`,
      error: '',
    });
    return result;
  }

  if (action === 'mouse_down' || action === 'mouse_up') {
    const button = String(payload.button || 'left').trim().toLowerCase();
    const hasCoords = Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y));
    const x = hasCoords ? Math.round(Number(payload.x)) : null;
    const y = hasCoords ? Math.round(Number(payload.y)) : null;
    const mouseFlags = {
      left: { down: 2, up: 4 },
      right: { down: 8, up: 16 },
      middle: { down: 32, up: 64 },
    };
    const flags = mouseFlags[button];
    if (!flags) {
      return { ok: false, error: `Mouse button non supportato: ${button}` };
    }

    const flag = action === 'mouse_down' ? flags.down : flags.up;
    const result = await runPowerShellJson(`
${buildComputerPowerShellPrelude()}
${hasCoords ? `[void][NyxComputerWin32]::SetCursorPos(${x}, ${y})` : ''}
[NyxComputerWin32]::mouse_event([uint32] ${flag}, 0, 0, 0, [UIntPtr]::Zero)
[pscustomobject]@{ ok = $true; action = ${JSON.stringify(action)}; button = ${JSON.stringify(button)} } | ConvertTo-Json -Compress
`);

    await refreshComputerState().catch(() => null);
    updateComputerState({
      ...(hasCoords ? { cursorX: x, cursorY: y } : {}),
      lastAction: `${action} ${button}${hasCoords ? ` @ ${x},${y}` : ''}`,
      lastResult: action === 'mouse_down' ? `${button} mouse down.` : `${button} mouse up.`,
      error: '',
    });
    return result;
  }

  if (action === 'type_text') {
    const text = String(payload.text || '');
    if (!text) {
      return { ok: false, error: 'type_text richiede text.' };
    }
    const controlId = payload.controlId;
    const foregroundHandle = Number(computerState.foregroundHandle || 0);
    if (controlId !== undefined && controlId !== null && Number.isFinite(foregroundHandle) && foregroundHandle > 0) {
      try {
        const result = await ccCallPywinautoTool('automation_elements', {
          operation: 'set_text',
          window_handle: foregroundHandle,
          control_id: controlId,
          text,
        });
        await refreshComputerState().catch(() => null);
        updateComputerState({
          desktopBackend: 'pywinauto-mcp',
          lastAction: `type_text control ${controlId}`,
          lastResult: `Testo inviato via pywinauto-mcp su control ${controlId}.`,
          error: '',
        });
        return {
          ok: true,
          ...result,
          backend: 'pywinauto-mcp',
        };
      } catch (error) {
        appendPywinautoMcpLog(error.message || String(error), 'type-fallback');
      }
    }

    const paste = payload.paste !== false;
    const encodedText = Buffer.from(text, 'utf8').toString('base64');
    const result = await runPowerShellJson(`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedText}'))
if (${paste ? '$true' : '$false'}) {
  Set-Clipboard -Value $text
  Start-Sleep -Milliseconds 80
  [System.Windows.Forms.SendKeys]::SendWait('^v')
} else {
  [System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(escapeSendKeysLiteral(text))})
}
[pscustomobject]@{ ok = $true; chars = $text.Length; paste = ${paste ? '$true' : '$false'} } | ConvertTo-Json -Compress
`);

    await refreshComputerState().catch(() => null);
    updateComputerState({
      lastAction: `type_text ${normalizeLine(text, 60)}`,
      lastResult: paste ? 'Testo incollato.' : 'Testo digitato.',
      error: '',
    });
    return result;
  }

  if (action === 'key_press') {
    const key = String(payload.key || '').trim();
    const modifiers = normalizeComputerModifiers(payload.modifiers);
    const sendKeysCombo = buildSendKeysCombo(key, modifiers);
    if (!key || !sendKeysCombo) {
      return { ok: false, error: 'key_press richiede key valida.' };
    }

    const result = await runPowerShellJson(`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(sendKeysCombo)})
[pscustomobject]@{
  ok = $true
  key = ${JSON.stringify(key)}
  modifiers = @(${modifiers.map((item) => JSON.stringify(item)).join(', ')})
} | ConvertTo-Json -Compress
`);

    await refreshComputerState().catch(() => null);
    updateComputerState({
      lastAction: `key_press ${[...modifiers, key].join('+')}`,
      lastResult: 'Tasto inviato.',
      error: '',
    });
    return result;
  }

  if (action === 'hotkey') {
    const combo = String(payload.combo || payload.keys || '').trim();
    const sendKeysCombo = convertHotkeyComboToSendKeys(combo);
    if (!combo || !sendKeysCombo) {
      return { ok: false, error: 'hotkey richiede combo valida.' };
    }

    const repeats = Math.max(1, Number(payload.repeats || 1));
    const intervalMs = Math.max(0, Number(payload.intervalMs || 0));
    const result = await runPowerShellJson(`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$combo = ${JSON.stringify(sendKeysCombo)}
for ($i = 0; $i -lt ${Math.round(repeats)}; $i++) {
  [System.Windows.Forms.SendKeys]::SendWait($combo)
  if (${Math.round(intervalMs)} -gt 0) {
    Start-Sleep -Milliseconds ${Math.round(intervalMs)}
  }
}
[pscustomobject]@{ ok = $true; combo = ${JSON.stringify(combo)}; repeats = ${Math.round(repeats)} } | ConvertTo-Json -Compress
`);

    await refreshComputerState().catch(() => null);
    updateComputerState({
      lastAction: `hotkey ${combo}`,
      lastResult: 'Hotkey inviata.',
      error: '',
    });
    return result;
  }

  if (action === 'open_app' || action === 'launch' || action === 'open') {
    const appTarget = String(payload.app || payload.path || payload.target || '').trim();
    const args = Array.isArray(payload.args)
      ? payload.args.map((item) => String(item ?? '').trim()).filter(Boolean)
      : [];
    if (!appTarget) {
      return { ok: false, error: 'open_app richiede app o path.' };
    }

    const result = await runPowerShellJson(`
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$target = ${JSON.stringify(appTarget)}
$args = @(${args.map((item) => JSON.stringify(item)).join(', ')})
if ($args.Count -gt 0) {
  $proc = Start-Process -FilePath $target -ArgumentList $args -PassThru
} else {
  $proc = Start-Process -FilePath $target -PassThru
}
[pscustomobject]@{
  ok = $true
  target = $target
  pid = [int]$proc.Id
} | ConvertTo-Json -Compress
`);

    await sleep(300);
    await refreshComputerState().catch(() => null);
    updateComputerState({
      lastAction: `open_app ${appTarget}`,
      lastResult: `Applicazione avviata: ${appTarget}`,
      error: '',
    });
    return result;
  }

  if (action === 'screenshot') {
    const targetPath = String(payload.path || '').trim();
    const region = String(payload.region || '').trim();
    let result;
    try {
      result = await captureComputerScreenshotWithOcr(targetPath, region);
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }

    await refreshComputerState().catch(() => null);
    updateComputerState({
      lastAction: 'screenshot',
      lastResult: [`Screenshot salvato in ${result?.path || targetPath}`, buildComputerOcrNote(result)].filter(Boolean).join(' '),
      lastScreenshotPath: String(result?.path || targetPath),
      lastScreenshotText: String(result?.ocrText || ''),
      lastReadSource: String(result?.readSource || ''),
      desktopBackend: String(result?.readSource || '').includes('pywinauto') ? 'pywinauto-mcp' : computerState.desktopBackend,
      ocrStatus: String(result?.ocrStatus || 'idle'),
      error: '',
    });
    return result;
  }

  return { ok: false, error: `Azione computer non supportata: ${action}` };
}

async function handleComputerDirective(directive = {}) {
  const requestId = directive?.requestId || null;
  const actionSummary = summarizeComputerDirective(directive);
  const action = String(directive?.action || directive?.kind || '').trim().toLowerCase();
  const beforeObservation = getComputerObservationSnapshot();
  updateComputerState({
    active: true,
    phase: 'acting',
    requestId,
    currentAction: actionSummary,
    error: '',
  });

  try {
    const result = await performComputerAction(directive);
    if (result?.ok === false) {
      updateComputerState({
        active: false,
        phase: 'error',
        requestId,
        currentAction: actionSummary,
        error: result.error || 'Errore computer_use',
      });
      return result;
    }

    const semanticResult = action === 'screenshot'
      ? computerState.lastResult
      : summarizeComputerActionResult(action, directive, result, beforeObservation, computerState);

    if (action !== 'screenshot') {
      updateComputerState({
        active: true,
        phase: 'verifying',
        requestId,
        currentAction: `${actionSummary} | screenshot + ocr check`,
        ocrStatus: 'reading',
      });

      let verificationShot;
      try {
        verificationShot = await captureComputerScreenshotWithOcr(
          buildComputerVerificationShotPath(actionSummary),
          getComputerForegroundRegion(),
        );
      } catch (error) {
        updateComputerState({
          active: false,
          phase: 'error',
          requestId,
          currentAction: actionSummary,
          error: `Verifica screenshot fallita: ${error?.message || String(error)}`,
        });
        return {
          ok: false,
          error: `Verifica screenshot fallita: ${error?.message || String(error)}`,
        };
      }

      updateComputerState({
        lastScreenshotPath: String(verificationShot?.path || ''),
        lastScreenshotText: String(verificationShot?.ocrText || ''),
        lastReadSource: String(verificationShot?.readSource || ''),
        desktopBackend: String(verificationShot?.readSource || '').includes('pywinauto') ? 'pywinauto-mcp' : computerState.desktopBackend,
        ocrStatus: String(verificationShot?.ocrStatus || 'idle'),
        lastResult: semanticResult
          ? `${semanticResult} Screenshot catturato per verifica. ${buildComputerOcrNote(verificationShot)}`.trim()
          : `Screenshot catturato per verifica. ${buildComputerOcrNote(verificationShot)}`.trim(),
        error: '',
      });
    } else {
      updateComputerState({
        lastResult: semanticResult,
      });
    }

    updateComputerState({
      active: false,
      phase: 'idle',
      requestId,
      currentAction: '',
      error: '',
    });
    return result;
  } catch (error) {
    updateComputerState({
      active: false,
      phase: 'error',
      requestId,
      currentAction: actionSummary,
      error: error?.message || String(error),
    });
    throw error;
  }
}

async function maybeCompleteComputerFileSaveFlow(userText, typedTextBuffer = '') {
  const saveTarget = inferRequestedFileSaveTarget(userText);
  if (!saveTarget) {
    return null;
  }

  await refreshComputerState().catch(() => null);
  const saveDialogTitle = String(computerState.foregroundTitle || '').trim();
  if (!isSaveDialogWindowTitle(saveDialogTitle)) {
    return null;
  }

  const result = await runPowerShellJson(`
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$dialogTitle = ${JSON.stringify(saveDialogTitle)}
$targetPath = ${JSON.stringify(saveTarget.targetPath)}
$root = [System.Windows.Automation.AutomationElement]::RootElement
$windows = $root.FindAll(
  [System.Windows.Automation.TreeScope]::Children,
  [System.Windows.Automation.Condition]::TrueCondition
)
$dialog = $null
for ($i = 0; $i -lt $windows.Count; $i++) {
  $candidate = $windows.Item($i)
  $name = [string]$candidate.Current.Name
  if (-not $name) { continue }
  if ($name -eq $dialogTitle -or $name.Contains($dialogTitle) -or $dialogTitle.Contains($name)) {
    $dialog = $candidate
    break
  }
}
if (-not $dialog) {
  throw "Save dialog not found: $dialogTitle"
}

$editCondition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Edit
)
$edits = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCondition)
$fileNameEdit = $null
for ($i = 0; $i -lt $edits.Count; $i++) {
  $candidate = $edits.Item($i)
  $name = [string]$candidate.Current.Name
  if ($name -match 'Nome file|File name') {
    $fileNameEdit = $candidate
    break
  }
}
if (-not $fileNameEdit -and $edits.Count -gt 0) {
  $fileNameEdit = $edits.Item($edits.Count - 1)
}
if (-not $fileNameEdit) {
  throw 'File name edit control not found in save dialog.'
}

$valuePattern = $null
if ($fileNameEdit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern)) {
  $valuePattern.SetValue($targetPath)
} else {
  $fileNameEdit.SetFocus()
  Start-Sleep -Milliseconds 120
  Set-Clipboard -Value $targetPath
  Start-Sleep -Milliseconds 60
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  Start-Sleep -Milliseconds 40
  [System.Windows.Forms.SendKeys]::SendWait('^v')
}

Start-Sleep -Milliseconds 180
$buttonCondition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Button
)
$buttons = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
$saveButton = $null
for ($i = 0; $i -lt $buttons.Count; $i++) {
  $candidate = $buttons.Item($i)
  $name = [string]$candidate.Current.Name
  if ($name -match '^(Salva|Save)$') {
    $saveButton = $candidate
    break
  }
}
if ($saveButton) {
  $invokePattern = $null
  if ($saveButton.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invokePattern)) {
    $invokePattern.Invoke()
  } else {
    $saveButton.SetFocus()
    Start-Sleep -Milliseconds 80
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  }
} else {
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
}

Start-Sleep -Milliseconds 300
$windowsAfterSave = $root.FindAll(
  [System.Windows.Automation.TreeScope]::Children,
  [System.Windows.Automation.Condition]::TrueCondition
)
for ($i = 0; $i -lt $windowsAfterSave.Count; $i++) {
  $candidate = $windowsAfterSave.Item($i)
  $name = [string]$candidate.Current.Name
  if ($name -match 'Conferma salvataggio con nome|Confirm Save As|Sostituisci|Replace') {
    $confirmButtons = $candidate.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
    for ($j = 0; $j -lt $confirmButtons.Count; $j++) {
      $confirm = $confirmButtons.Item($j)
      $confirmName = [string]$confirm.Current.Name
      if ($confirmName -match '^(Sì|Si|Yes|Save|Sostituisci|Replace)$') {
        $confirmInvoke = $null
        if ($confirm.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$confirmInvoke)) {
          $confirmInvoke.Invoke()
        } else {
          $confirm.SetFocus()
          Start-Sleep -Milliseconds 60
          [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
        }
        break
      }
    }
  }
}
[pscustomobject]@{
  ok = $true
  targetPath = $targetPath
} | ConvertTo-Json -Compress
`);

  let verified = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(250);
    if (fs.existsSync(saveTarget.targetPath)) {
      verified = true;
      break;
    }
  }

  await refreshComputerState().catch(() => null);
  updateComputerState({
    lastAction: `save_file ${saveTarget.targetPath}`,
    lastResult: verified
      ? `File salvato in ${saveTarget.targetPath}`
      : `Ho provato a salvare ${saveTarget.fileName}, ma non vedo ancora il file sul disco.`,
    error: verified ? '' : 'Salvataggio file non verificato.',
  });

  return {
    ok: verified,
    targetPath: saveTarget.targetPath,
    attempted: result?.ok !== false,
  };
}

function appendTtsServiceLog(chunk, source) {
  const line = `[${source}] ${String(chunk || '').trim()}`;
  if (!line.trim()) return;
  ttsServiceLogTail = `${ttsServiceLogTail}\n${line}`.trim().slice(-12000);
}

const ttsService = new TtsService({
  url: KOKORO_URL,
  port: KOKORO_PORT,
  speaker: KOKORO_SPEAKER,
  python: KOKORO_PYTHON,
  script: KOKORO_SERVER_SCRIPT,
  startupTimeout: KOKORO_STARTUP_TIMEOUT_MS,
  onStatusChange: (status, payload) => {
    if (status === 'ready') {
      setTtsState('ready', {
        latencyMs: payload && typeof payload === 'object' ? payload.latencyMs ?? null : null,
        error: null,
      });
      return;
    }
    if (status === 'loading') {
      setTtsState('loading', { error: null });
      return;
    }
    if (status === 'error') {
      ttsServiceLogTail = ttsService.getLogTail();
      setTtsState('error', {
        error: typeof payload === 'string' ? payload : String(payload || 'Kokoro error'),
      });
      return;
    }
    if (status === 'idle') {
      setTtsState('idle', { error: null });
    }
  },
});

function getTtsProviderDisplayName() {
  return ttsService.getProviderDisplayName();
}

async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function probeTtsHealth() {
  try {
    const response = await fetch(`${KOKORO_URL}/health`);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.ready ? data : null;
  } catch {
    return null;
  }
}

function stopTtsService() {
  if (ttsWarmupTimer) {
    clearTimeout(ttsWarmupTimer);
    ttsWarmupTimer = null;
  }
  ttsService.stop();
  ttsServiceLogTail = ttsService.getLogTail();
}

async function ensureTtsService() {
  try {
    const result = await ttsService.ensure();
    ttsServiceLogTail = ttsService.getLogTail();
    return result;
  } catch (error) {
    ttsServiceLogTail = ttsService.getLogTail();
    throw error;
  }
}

function isTtsUnavailableError(error) {
  const message = String(error?.message || error || '').trim();
  if (!message) return false;
  return (
    message.includes('Kokoro Python not found:')
    || message.includes('No usable Python launcher found for Kokoro TTS')
    || message.includes('Kokoro server script not found:')
  );
}

async function synthesizeSpeechToBase64(text) {
  const safeText = String(text || '').trim();
  if (!safeText) return null;

  try {
    const audioBase64 = await ttsService.synthesize(safeText);
    ttsServiceLogTail = ttsService.getLogTail();
    return audioBase64;
  } catch (error) {
    if (isTtsUnavailableError(error)) {
      setTtsState('idle', {
        error: null,
        latencyMs: null,
      });
      return null;
    }
    ttsServiceLogTail = ttsService.getLogTail();
    throw error;
  }
}

function normalizeEmotion(value, fallback = 'neutral') {
  const emotion = String(value || '').trim().toLowerCase();
  if (!emotion) return fallback;

  const aliasMap = {
    surprise: 'surprised',
    calm: 'neutral',
    excited: 'happy',
    curiosity: 'curious',
    confused: 'question',
    awkwardly: 'awkward',
    disgusted: 'disgust',
  };

  const normalized = aliasMap[emotion] || emotion;
  const supported = ['happy', 'sad', 'angry', 'think', 'surprised', 'awkward', 'question', 'curious', 'neutral', 'fear', 'love', 'sleep', 'disgust'];
  return supported.includes(normalized) ? normalized : fallback;
}

const EMOJI_TO_EMOTION = {
  '😐': 'neutral', '😶': 'neutral',
  '😏': 'happy', '😒': 'neutral',
  '🙂': 'happy', '🙃': 'happy',
  '😊': 'happy', '😇': 'happy', '🥰': 'love',
  '😀': 'happy', '😃': 'happy', '😄': 'happy', '😁': 'happy', '😆': 'happy',
  '😍': 'love', '🤩': 'love',
  '😝': 'happy', '😋': 'happy', '😛': 'happy', '😜': 'happy', '🤪': 'happy',
  '😂': 'happy', '🤣': 'happy', '😅': 'happy',
  '😉': 'happy',
  '😭': 'sad', '🥺': 'sad', '😞': 'sad', '😔': 'sad', '☹️': 'sad',
  '😳': 'happy',
  '😚': 'love', '😘': 'love',
  '😡': 'angry', '😠': 'angry', '🤬': 'angry',
  '😱': 'fear',
  '😲': 'surprised', '😮': 'surprised',
  '😬': 'neutral',
  '🙄': 'neutral',
  '🤔': 'think',
  '👀': 'neutral',
  '😴': 'sleep',
};

function resolveEmotionFromEmoji(text) {
  if (!text) return null;
  const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/gu;
  const emojis = text.match(emojiPattern);
  if (!emojis) return null;
  for (const emoji of emojis) {
    if (EMOJI_TO_EMOTION[emoji]) return EMOJI_TO_EMOTION[emoji];
  }
  return null;
}

function normalizeExpression(value, fallbackEmotion = 'neutral') {
  const expression = normalizeEmotion(value, fallbackEmotion);
  const aliasMap = {
    question: 'think',
    curious: 'think',
    awkward: 'neutral',
  };
  return aliasMap[expression] || expression;
}

function normalizeGesture(value) {
  const gesture = String(value || '').trim();
  if (!gesture || ['null', 'none'].includes(gesture.toLowerCase())) {
    return null;
  }

  const aliasMap = {
    wave: 'handup',
    greet: 'handup',
    greeting: 'handup',
    explain: 'index',
    point: 'index',
    approve: 'thumbup',
    celebrate: 'dance',
    celebration: 'dance',
    move: 'walking',
    walk: 'walking',
    standing: 'straight',
    stand: 'straight',
    sit: 'sitting',
    seated: 'sitting',
    seated_down: 'sitting',
    sitting_down: 'sitting',
    seduta: 'sitting',
    seduto: 'sitting',
    siediti: 'sitting',
    siedi: 'sitting',
    accucciata: 'bend',
    accucciato: 'bend',
    rannicchiata: 'bend',
    rannicchiato: 'bend',
    rannicchiarsi: 'bend',
    rannicchiati: 'bend',
    piegata: 'bend',
    piegato: 'bend',
    chinata: 'bend',
    chinato: 'bend',
    curva: 'bend',
    curvo: 'bend',
    dancing: 'dance',
    balla: 'dance',
    ballerina: 'dance',
    thanks: 'namaste',
  };

  return aliasMap[gesture.toLowerCase()] || gesture.toLowerCase();
}

function normalizeAvatarHand(value) {
  const hand = String(value || '').trim().toLowerCase();
  if (!hand || ['null', 'none'].includes(hand)) {
    return null;
  }

  const aliasMap = {
    sx: 'left',
    sinistra: 'left',
    left: 'left',
    dx: 'right',
    destra: 'right',
    right: 'right',
    both: 'both',
    entrambe: 'both',
    tutte: 'both',
    all: 'both',
  };

  return aliasMap[hand] || null;
}

function normalizeAvatarDirection(value, fallback = null) {
  const direction = String(value || '').trim().toLowerCase();
  if (!direction || ['null', 'none'].includes(direction)) {
    return fallback;
  }

  const aliasMap = {
    sx: 'left',
    sinistra: 'left',
    left: 'left',
    dx: 'right',
    destra: 'right',
    right: 'right',
  };

  return aliasMap[direction] || fallback;
}

const AVATAR_GESTURES = new Set(['handup', 'ok', 'index', 'thumbup', 'thumbdown', 'side', 'shrug', 'namaste']);
const AVATAR_POSES = new Set(['straight', 'side', 'hip', 'turn', 'back', 'wide', 'oneknee', 'kneel', 'bend', 'sitting', 'dance']);
const AVATAR_ANIMATIONS = new Set(['walking', 'turnwalk']);
const AVATAR_EMOJIS = new Set(['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫡','🤭','🫢','🫣','🤫','🤥','😶','🫥','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏']);

function findAssetKey(value, collection) {
  if (!value || !collection) return null;
  const normalized = String(value).toLowerCase().trim();
  if (collection[normalized]) return normalized;
  for (const key of Object.keys(collection)) {
    const item = collection[key];
    const url = String(item?.url || item?.name || '').toLowerCase();
    if (url === normalized || key.toLowerCase() === normalized) return key;
  }
  return null;
}

function resolveAvatarMotion(value, preferredType = null) {
  const motion = normalizeGesture(value);
  if (!motion) {
    return { motion: null, motionType: null };
  }

  if (preferredType === 'gesture' && AVATAR_GESTURES.has(motion)) {
    return { motion, motionType: 'gesture' };
  }

  if (preferredType === 'pose' && AVATAR_POSES.has(motion)) {
    return { motion, motionType: 'pose' };
  }

  if (preferredType === 'animation' && AVATAR_ANIMATIONS.has(motion)) {
    return { motion, motionType: 'animation' };
  }

  if (AVATAR_ANIMATIONS.has(motion)) {
    return { motion, motionType: 'animation' };
  }

  if (AVATAR_POSES.has(motion) && !AVATAR_GESTURES.has(motion)) {
    return { motion, motionType: 'pose' };
  }

  if (AVATAR_GESTURES.has(motion) && !AVATAR_POSES.has(motion)) {
    return { motion, motionType: 'gesture' };
  }

  if (motion === 'side') {
    return { motion, motionType: preferredType || 'pose' };
  }

  return { motion, motionType: preferredType || 'gesture' };
}

function resolveAvatarAsset(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();

  if (AVATAR_EMOJIS.has(raw)) {
    return { type: 'emoji', value: raw };
  }

  if (normalized === 'yes' || normalized === 'nod') {
    return { type: 'gesture', value: 'yes' };
  }
  if (normalized === 'no' || normalized === 'shake') {
    return { type: 'gesture', value: 'no' };
  }

  if (AVATAR_GESTURES.has(normalized)) {
    return { type: 'gesture', value: normalized };
  }
  if (AVATAR_ANIMATIONS.has(normalized)) {
    return { type: 'animation', value: normalized };
  }
  if (AVATAR_POSES.has(normalized)) {
    return { type: 'pose', value: normalized };
  }

  return { type: 'raw', value: normalized };
}

function extractExplicitMotion(input) {
  const source = input || {};
  const poseSpecified = Object.prototype.hasOwnProperty.call(source, 'pose');
  const animationSpecified = Object.prototype.hasOwnProperty.call(source, 'animation');
  const gestureSpecified = Object.prototype.hasOwnProperty.call(source, 'gesture');
  const motionSpecified = Object.prototype.hasOwnProperty.call(source, 'motion') || Object.prototype.hasOwnProperty.call(source, 'action');
  const gestureHand = normalizeAvatarHand(source.hand || source.gestureHand || source.side || source.gestureSide);
  const direction = normalizeAvatarDirection(source.direction || source.motionDirection || source.moveDirection, null);
  let pose = null;
  let animation = null;
  let gesture = null;
  let motion = null;
  let motionType = null;
  let hasExplicitMotion = false;

  if (poseSpecified) {
    const resolved = resolveAvatarMotion(source.pose, 'pose');
    hasExplicitMotion = true;
    if (resolved.motionType === 'pose') {
      pose = resolved.motion;
      if (!motion) {
        motion = resolved.motion;
        motionType = resolved.motionType;
      }
    }
  }

  if (animationSpecified) {
    const resolved = resolveAvatarMotion(source.animation, 'animation');
    hasExplicitMotion = true;
    if (resolved.motionType === 'animation') {
      animation = resolved.motion;
      if (!motion) {
        motion = resolved.motion;
        motionType = resolved.motionType;
      }
    }
  }

  if (gestureSpecified) {
    const resolved = resolveAvatarMotion(source.gesture, 'gesture');
    hasExplicitMotion = true;
    if (resolved.motionType === 'gesture') {
      gesture = resolved.motion;
      motion = resolved.motion;
      motionType = resolved.motionType;
    }
  }

  if (motionSpecified) {
    const preferredType = typeof source.motionType === 'string' ? source.motionType : null;
    const resolved = resolveAvatarMotion(source.motion || source.action, preferredType);
    hasExplicitMotion = true;
    if (resolved.motionType === 'pose') {
      pose = resolved.motion;
    } else if (resolved.motionType === 'animation') {
      animation = resolved.motion;
    } else if (resolved.motionType === 'gesture') {
      gesture = resolved.motion;
    }
    if (resolved.motion) {
      motion = resolved.motion;
      motionType = resolved.motionType;
    }
  }

  return {
    pose,
    animation,
    gesture,
    gestureHand,
    direction,
    motion,
    motionType,
    motionSpecified: hasExplicitMotion,
  };
}

function clampIntensity(value, fallback = 0.72) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function inferAvatarReaction(text) {
  const input = String(text || '').toLowerCase();
  const hasAny = (...words) => words.some((word) => input.includes(word));
  const inferredDirection = hasAny('sinistra', 'verso sinistra', 'a sinistra', 'left')
    ? 'left'
    : hasAny('destra', 'verso destra', 'a destra', 'right')
      ? 'right'
      : null;

  const emojiEmotion = resolveEmotionFromEmoji(text);
  if (emojiEmotion && emojiEmotion !== 'neutral') {
    const style = EMOTION_TO_AVATAR_STYLE[emojiEmotion] || EMOTION_TO_AVATAR_STYLE.neutral;
    return { emotion: emojiEmotion, motion: style.motion, motionType: style.motionType, expression: style.expression, intensity: 0.72 };
  }

  if (hasAny('balla', 'ballare', 'dance', 'dancing', 'festa', 'festegg', 'celebra', 'esulta', 'euforia')) {
    return { emotion: 'happy', motion: 'dance', motionType: 'pose', expression: 'happy', intensity: 0.9 };
  }

  if (hasAny('cammina', 'walk', 'andiamo', 'guidami', 'mostrami')) {
    if (inferredDirection) {
      return {
        emotion: 'curious',
        motion: 'turnwalk',
        motionType: 'animation',
        direction: inferredDirection,
        expression: 'think',
        intensity: 0.66,
      };
    }
    return { emotion: 'curious', motion: 'walking', motionType: 'animation', expression: 'think', intensity: 0.66 };
  }

  if (hasAny('girati', 'turn', 'voltati')) {
    return { emotion: 'neutral', motion: 'turn', motionType: 'pose', expression: 'neutral', intensity: 0.54 };
  }

  if (hasAny('dietro', 'back')) {
    return { emotion: 'neutral', motion: 'back', motionType: 'pose', expression: 'neutral', intensity: 0.54 };
  }

  if (hasAny('larga', 'wide')) {
    return { emotion: 'happy', motion: 'wide', motionType: 'pose', expression: 'happy', intensity: 0.58 };
  }

  if (hasAny('fianco', 'hip')) {
    return { emotion: 'happy', motion: 'hip', motionType: 'pose', expression: 'happy', intensity: 0.58 };
  }

  if (hasAny('inginocchia', 'kneel', 'ginocchio')) {
    return { emotion: 'sad', motion: 'kneel', motionType: 'pose', expression: 'sad', intensity: 0.64 };
  }

  if (hasAny('un ginocchio', 'oneknee')) {
    return { emotion: 'sad', motion: 'oneknee', motionType: 'pose', expression: 'sad', intensity: 0.64 };
  }

  if (hasAny('piegati', 'piegata', 'piegato', 'chinati', 'chinata', 'chinato', 'bend', 'rannicchia', 'rannicchiati', 'rannicchiata', 'rannicchiato', 'accucciati', 'accucciata', 'accucciato', 'curvati', 'curvata', 'curvato')) {
    return { emotion: 'awkward', motion: 'bend', motionType: 'pose', expression: 'neutral', intensity: 0.52 };
  }

  if (hasAny('seduta', 'seduto', 'siediti', 'siedi', 'sit', 'sitting', 'riposa', 'riposati', 'rilassati')) {
    return { emotion: 'neutral', motion: 'sitting', motionType: 'pose', expression: 'neutral', intensity: 0.54 };
  }

  if (hasAny('grazie', 'thank')) {
    return { emotion: 'happy', motion: 'namaste', motionType: 'gesture', expression: 'happy', intensity: 0.62 };
  }

  if (hasAny('bravo', 'ottimo', 'perfetto', 'great', 'successo')) {
    return { emotion: 'happy', motion: 'thumbup', motionType: 'gesture', expression: 'happy', intensity: 0.84 };
  }

  if (hasAny('errore', 'problema', 'bug', 'fail')) {
    return { emotion: 'angry', motion: 'side', motionType: 'pose', expression: 'angry', intensity: 0.68 };
  }

  if (hasAny('triste', 'sad', 'peccato')) {
    return { emotion: 'sad', motion: 'sitting', motionType: 'pose', expression: 'sad', intensity: 0.6 };
  }

  if (hasAny('non so', 'forse', 'maybe', 'boh')) {
    return { emotion: 'question', motion: 'shrug', motionType: 'gesture', expression: 'think', intensity: 0.52 };
  }

  return { emotion: 'neutral', motion: null, motionType: null, expression: 'neutral', intensity: 0.35 };
}

const EMOTION_TO_AVATAR_STYLE = {
  happy: { mood: 'happy', expression: 'happy', motion: null, motionType: null },
  sad: { mood: 'sad', expression: 'sad', motion: 'sitting', motionType: 'pose' },
  angry: { mood: 'angry', expression: 'angry', motion: 'side', motionType: 'pose' },
  think: { mood: 'neutral', expression: 'think', motion: null, motionType: null },
  surprised: { mood: 'happy', expression: 'surprised', motion: 'handup', motionType: 'gesture' },
  awkward: { mood: 'neutral', expression: 'neutral', motion: null, motionType: null },
  question: { mood: 'neutral', expression: 'think', motion: 'shrug', motionType: 'gesture' },
  curious: { mood: 'neutral', expression: 'think', motion: null, motionType: null },
  neutral: { mood: 'neutral', expression: 'neutral', motion: null, motionType: null },
  fear: { mood: 'fear', expression: 'fear', motion: 'side', motionType: 'pose' },
  disgust: { mood: 'disgust', expression: 'disgust', motion: 'side', motionType: 'pose' },
  love: { mood: 'love', expression: 'happy', motion: null, motionType: null },
  sleep: { mood: 'sleep', expression: 'sleep', motion: 'sitting', motionType: 'pose' },
};

function readLooseActField(source, keys) {
  const text = String(source || '');

  for (const key of keys) {
    const regex = new RegExp(`${key}\\s*[:=]\\s*(?:\\{\\s*name\\s*[:=]\\s*["']?([a-z0-9_.-]+)["']?[^}]*\\}|["']?([a-z0-9_.-]+)["']?)`, 'i');
    const match = text.match(regex);
    if (match) {
      return match[1] || match[2] || '';
    }
  }

  return '';
}

function readLooseActNumber(source, keys) {
  const text = String(source || '');

  for (const key of keys) {
    const regex = new RegExp(`${key}\\s*[:=]\\s*["']?(-?\\d+(?:\\.\\d+)?)["']?`, 'i');
    const match = text.match(regex);
    if (match) {
      return Number(match[1]);
    }
  }

  return undefined;
}

function parseStructuredField(output, key) {
  const pattern = new RegExp(`${key}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`, 'i');
  const match = String(output || '').match(pattern);
  return match ? match[1].trim() : '';
}



function isMissingSavedQwenSessionError(text = '') {
  const source = String(text || '');
  return /No saved session found with ID/i.test(source);
}

function parseLooseJsonObject(source) {
  const text = String(source || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    try {
      const normalized = text
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3')
        .replace(/:\s*'([^']*)'/g, ': "$1"');
      return JSON.parse(normalized);
    } catch {
      return null;
    }
  }
}

function parseActPayload(payloadText, fallbackText = '') {
  const fallback = inferAvatarReaction(fallbackText);
  const source = String(payloadText || '').trim();

  try {
    const payload = JSON.parse(source);

    const explicitMotion = extractExplicitMotion(payload);
    const emotionField = payload?.emotion;
    const emotionValue = typeof emotionField === 'string'
      ? emotionField
      : emotionField && typeof emotionField === 'object'
        ? emotionField.name
        : undefined;
    const intensityValue = typeof emotionField === 'object' && emotionField !== null
      ? emotionField.intensity ?? payload?.intensity
      : payload?.intensity;
    const cognitive = String(payload?.cognitive || '').toLowerCase();
    const intent = String(payload?.intent || '').toLowerCase();
    const expressionHint = payload?.expression || (cognitive.includes('think') || intent === 'ask' ? 'think' : undefined);

    const sequentialMoods = parseSequentialMoods(emotionValue);
    const isSurprise = emotionValue === 'surprised' || emotionValue === 'surprise';
    const surpriseGesture = isSurprise ? '😱' : null;
    const resolvedGesture = surpriseGesture || explicitMotion.motion;

    return {
      emotion: normalizeEmotion(emotionValue, fallback.emotion),
      intensity: clampIntensity(intensityValue, fallback.intensity),
      pose: explicitMotion.pose,
      animation: explicitMotion.animation,
      gesture: resolvedGesture && explicitMotion.motionType === 'gesture' ? resolvedGesture : explicitMotion.gesture,
      gestureHand: explicitMotion.gestureHand,
      direction: explicitMotion.direction,
      motion: resolvedGesture || explicitMotion.motion,
      motionType: resolvedGesture ? 'gesture' : explicitMotion.motionType,
      expression: normalizeExpression(expressionHint, emotionValue || 'neutral'),
      motionSpecified: explicitMotion.motionSpecified || !!surpriseGesture,
      sequentialMoods: sequentialMoods.length ? sequentialMoods : null,
      multiAction: !!payload?.actions && Array.isArray(payload.actions),
      actions: Array.isArray(payload?.actions) ? payload.actions.map((a) => parseSingleActAction(a, fallback)) : null,
    };
  } catch {
    const motionSpecified = /(motion|gesture|action|pose|animation)\s*[:=]/i.test(source);
    const looseEmotion = readLooseActField(source, ['emotion']);
    const loosePose = readLooseActField(source, ['pose']);
    const looseAnimation = readLooseActField(source, ['animation']);
    const looseGesture = readLooseActField(source, ['gesture']);
    const looseMotion = readLooseActField(source, ['motion', 'action']);
    const looseDirection = readLooseActField(source, ['direction']);
    const looseExpression = readLooseActField(source, ['expression', 'mood']);
    const looseCognitive = readLooseActField(source, ['cognitive']);
    const looseIntent = readLooseActField(source, ['intent']);
    const looseIntensity = readLooseActNumber(source, ['intensity']);
    const expressionHint = looseExpression || (String(looseCognitive).includes('think') || looseIntent === 'ask' ? 'think' : undefined);
    const explicitMotion = extractExplicitMotion({
      pose: loosePose || undefined,
      animation: looseAnimation || undefined,
      gesture: looseGesture || undefined,
      motion: looseMotion || undefined,
      direction: looseDirection || undefined,
    });

    const sequentialMoods = parseSequentialMoods(looseEmotion);
    const isSurprise = looseEmotion === 'surprised' || looseEmotion === 'surprise';
    const surpriseGesture = isSurprise ? '😱' : null;
    const resolvedGesture = surpriseGesture || explicitMotion.motion;

    if (!looseEmotion && !motionSpecified && looseIntensity == null && !expressionHint && !sequentialMoods.length) {
      return null;
    }

    return {
      emotion: normalizeEmotion(looseEmotion, fallback.emotion),
      intensity: clampIntensity(looseIntensity, fallback.intensity),
      pose: explicitMotion.pose,
      animation: explicitMotion.animation,
      gesture: resolvedGesture && explicitMotion.motionType === 'gesture' ? resolvedGesture : explicitMotion.gesture,
      gestureHand: explicitMotion.gestureHand,
      direction: explicitMotion.direction,
      motion: resolvedGesture || explicitMotion.motion,
      motionType: resolvedGesture ? 'gesture' : explicitMotion.motionType,
      expression: normalizeExpression(expressionHint, looseEmotion || 'neutral'),
      motionSpecified: motionSpecified || explicitMotion.motionSpecified || !!surpriseGesture,
      sequentialMoods: sequentialMoods.length ? sequentialMoods : null,
      multiAction: false,
      actions: null,
    };
  }
}

function parseSequentialMoods(value) {
  if (!value || typeof value !== 'string') return [];
  if (!value.includes(',')) return [];
  return value.split(',').map((m) => m.trim()).filter(Boolean).map((m) => ({
    mood: normalizeEmotion(m, 'neutral'),
    expression: normalizeExpression(m, 'neutral'),
  }));
}

function parseSingleActAction(action, fallback) {
  if (!action || typeof action !== 'object') return null;
  const emotionValue = typeof action?.emotion === 'string' ? action.emotion : action?.emotion?.name;
  const intensityValue = typeof action?.emotion === 'object' ? action.emotion.intensity : action?.intensity;
  const explicitMotion = extractExplicitMotion(action);
  return {
    emotion: normalizeEmotion(emotionValue, 'neutral'),
    intensity: clampIntensity(intensityValue, 0.72),
    pose: explicitMotion.pose,
    animation: explicitMotion.animation,
    gesture: explicitMotion.gesture,
    gestureHand: explicitMotion.gestureHand,
    motion: explicitMotion.motion,
    motionType: explicitMotion.motionType,
    expression: normalizeExpression(action?.expression, emotionValue || 'neutral'),
    delay: action?.delay || 0,
  };
}

function parseCanvasPayload(payloadText) {
  const payload = parseLooseJsonObject(payloadText);
  if (!payload || typeof payload !== 'object') return null;

  const action = String(payload.action || 'open').trim().toLowerCase() || 'open';
  const layout = baNormalizeCanvasLayout(payload.layout || payload.mode || canvasState.layout);
  const title = String(payload.title || payload.content?.title || 'Canvas').trim() || 'Canvas';

  return {
    action,
    layout,
    content: {
      ...payload.content,
      ...(!payload.content?.type && payload.type ? { type: payload.type } : {}),
      ...(!payload.content?.path && payload.path ? { path: payload.path } : {}),
      ...(!payload.content?.src && payload.src ? { src: payload.src } : {}),
      ...(!payload.content?.value && payload.value ? { value: payload.value } : {}),
      title,
    },
  };
}

function parseBrowserPayload(payloadText) {
  const payload = parseLooseJsonObject(payloadText);
  if (!payload || typeof payload !== 'object') return null;

  const action = String(payload.action || payload.kind || 'refresh').trim().toLowerCase() || 'refresh';
  const layout = baNormalizeCanvasLayout(payload.layout || payload.mode || canvasState.layout);

  return {
    action,
    kind: String(payload.kind || action).trim().toLowerCase(),
    layout,
    title: String(payload.title || '').trim(),
    url: String(payload.url || payload.href || '').trim(),
    value: String(payload.value || '').trim(),
    ref: String(payload.ref || '').trim(),
    text: String(payload.text || '').trim(),
    key: String(payload.key || '').trim(),
    waitNav: Boolean(payload.waitNav),
    waitAfterMs: Number(payload.waitAfterMs || 0) || undefined,
  };
}

function parseComputerPayload(payloadText) {
  const payload = parseLooseJsonObject(payloadText);
  if (!payload || typeof payload !== 'object') return null;

  return {
    action: String(payload.action || payload.kind || '').trim().toLowerCase(),
    titleContains: String(payload.titleContains || payload.title || '').trim(),
    processName: String(payload.processName || payload.process || '').trim(),
    x: Number(payload.x),
    y: Number(payload.y),
    button: String(payload.button || 'left').trim().toLowerCase(),
    clicks: Number(payload.clicks || 1) || 1,
    durationMs: Number(payload.durationMs || 0) || 0,
    text: String(payload.text || '').trim(),
    paste: payload.paste !== false,
    key: String(payload.key || '').trim(),
    modifiers: Array.isArray(payload.modifiers) ? payload.modifiers.map((item) => String(item).trim()).filter(Boolean) : [],
    combo: String(payload.combo || payload.keys || '').trim(),
    repeats: Number(payload.repeats || 1) || 1,
    intervalMs: Number(payload.intervalMs || 0) || 0,
    app: String(payload.app || payload.path || payload.target || '').trim(),
    args: Array.isArray(payload.args) ? payload.args.map((item) => String(item)) : [],
    path: String(payload.path || '').trim(),
    region: String(payload.region || '').trim(),
  };
}

function parseWorkspacePayload(payloadText) {
  const payload = parseLooseJsonObject(payloadText);
  if (!payload || typeof payload !== 'object') return null;

  const requestedFile = String(payload.file || payload.target || payload.path || '').trim();
  const normalizedFile = requestedFile && WORKSPACE_MUTABLE_FILES.includes(requestedFile)
    ? requestedFile
    : '';
  const fallbackMemoryFile = getWorkspaceMemoryFileName() || 'MEMORY.md';
  const file = normalizedFile || (String(payload.kind || '').trim().toLowerCase() === 'memory' ? fallbackMemoryFile : '');
  const content = normalizeSpeechText(String(payload.content || payload.value || payload.text || ''));
  const mode = String(payload.mode || 'append').trim().toLowerCase() || 'append';
  const title = normalizeLine(String(payload.title || payload.label || '').trim(), 120);

  if (!file || !WORKSPACE_MUTABLE_FILES.includes(file) || !content) {
    return null;
  }

  return {
    file,
    mode,
    title,
    content,
  };
}

const TOOL_ROUTER_STOPWORDS = new Set([
  'a', 'ad', 'al', 'alla', 'allo', 'ai', 'agli', 'all', 'anche', 'che', 'chi', 'con', 'da', 'dal', 'dalla',
  'dello', 'dei', 'del', 'delle', 'di', 'e', 'ed', 'il', 'in', 'la', 'le', 'li', 'lo', 'ma', 'mi', 'nei',
  'nel', 'nella', 'no', 'non', 'o', 'per', 'piu', 'poi', 'se', 'sei', 'si', 'su', 'tra', 'un', 'una', 'uno',
  'the', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'my', 'your', 'this', 'that',
]);

function tokenizeRoutePrompt(text) {
  const rawTokens = String(text || '')
    .toLowerCase()
    .match(/[a-z0-9_./:\\-]{2,}/g) || [];

  return Array.from(new Set(rawTokens.filter((token) => {
    if (!token || TOOL_ROUTER_STOPWORDS.has(token)) return false;
    if (/^\d+$/.test(token)) return false;
    return token.length >= 2;
  })));
}

function scoreRoutePrompt(tokens, haystacks) {
  const normalizedHaystacks = (Array.isArray(haystacks) ? haystacks : [])
    .map((item) => String(item || '').toLowerCase())
    .filter(Boolean);

  return tokens.reduce((sum, token) => (
    sum + (normalizedHaystacks.some((haystack) => haystack.includes(token)) ? 1 : 0)
  ), 0);
}

function getToolAvailability(type, directive = {}) {
  switch (String(type || '').trim().toLowerCase()) {
    case 'browser':
      if (pinchtabProcess || fs.existsSync(PINCHTAB_CLI_PATH) || fs.existsSync(PINCHTAB_PS1_PATH)) {
        return { available: true, reason: '' };
      }
      return { available: false, reason: 'Browser tool non disponibile: PinchTab non trovato.' };
    case 'computer':
      return computerState.supported
        ? { available: true, reason: '' }
        : { available: false, reason: 'Computer tool non disponibile su questa piattaforma.' };
    case 'canvas':
      return ENABLE_LIVE_CANVAS
        ? { available: true, reason: '' }
        : { available: false, reason: 'Canvas tool disabilitato in questa build.' };
    case 'git':
      return hasGitBinary()
        ? { available: true, reason: '' }
        : { available: false, reason: 'Git tool non disponibile: binario git non trovato.' };
    case 'workspace': {
      const fileName = String(directive.file || '').trim();
      if (fileName && !WORKSPACE_MUTABLE_FILES.includes(fileName)) {
        return { available: false, reason: `Workspace tool non disponibile per il file ${fileName}.` };
      }
      return { available: true, reason: '' };
    }
    default:
      return { available: true, reason: '' };
  }
}

function partitionAvailableToolCalls(toolCalls = []) {
  const available = [];
  const blocked = [];

  for (const call of Array.isArray(toolCalls) ? toolCalls : []) {
    const availability = getToolAvailability(call?.type, call?.directive || {});
    if (availability.available) {
      available.push(call);
    } else {
      blocked.push({
        type: call?.type || 'unknown',
        directive: call?.directive || {},
        ok: false,
        error: availability.reason || 'Tool non disponibile.',
      });
    }
  }

  return { available, blocked };
}

function hasCanvasDirective(sequence = []) {
  return Array.isArray(sequence) && sequence.some((item) => item?.type === 'canvas');
}

function buildBrowserStatePrompt() {
  if (canvasState.content?.type !== 'browser') {
    return '';
  }

  const browser = canvasState.content;
  const refLines = (browser.snapshotItems || [])
    .slice(0, 20)
    .map((item) => `- ${item.ref || 'node'} | ${item.role || 'node'} | ${normalizeLine(item.label, 140)}`)
    .join('\n');

  return [
    'ACTIVE_BROWSER:',
    browser.tabId ? `TAB_ID: ${browser.tabId}` : '',
    `URL: ${browser.currentUrl || browser.url || ''}`,
    `TITLE: ${browser.pageTitle || browser.title || 'Browser'}`,
    `STATUS: ${browser.status || 'idle'}`,
    browser.text ? `TEXT_PREVIEW: ${normalizeLine(browser.text, 700)}` : '',
    refLines ? `INTERACTIVE_REFS:\n${refLines}` : 'INTERACTIVE_REFS:\n- none',
  ].filter(Boolean).join('\n');
}

function extractRequestedWordCount(text) {
  const match = String(text || '').match(/(\d{1,4})\s*(?:parole|words?)/i);
  return match ? Math.max(1, Math.min(500, Number(match[1]) || 0)) : null;
}

function extractPathFromText(text) {
  const input = String(text || '');
  const quoted = input.match(/["']([A-Za-z]:\\[^"']+)["']/);
  if (quoted?.[1]) return quoted[1];

  const unquoted = input.match(/\b([A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*)/);
  if (unquoted?.[1]) return unquoted[1];

  const userHome = process.env.USERPROFILE || '';
  const lower = input.toLowerCase();
  if (lower.includes('desktop')) return path.join(userHome, 'Desktop');
  if (lower.includes('documenti') || lower.includes('documents')) return path.join(userHome, 'Documents');
  if (lower.includes('download')) return path.join(userHome, 'Downloads');
  if (lower.includes('immagini') || lower.includes('pictures')) return path.join(userHome, 'Pictures');
  if (lower.includes('video')) return path.join(userHome, 'Videos');
  if (lower.includes('musica') || lower.includes('music')) return path.join(userHome, 'Music');
  return '';
}

function extractRequestedFileName(text) {
  const input = String(text || '').trim();
  if (!input) return '';

  const explicitPath = extractPathFromText(input);
  if (explicitPath) {
    const parsed = path.parse(explicitPath);
    if (parsed.base && /\.[A-Za-z0-9]{1,8}$/.test(parsed.base)) {
      return parsed.base;
    }
  }

  const quotedFile = input.match(/["']([^"']+\.[A-Za-z0-9]{1,8})["']/);
  if (quotedFile?.[1]) {
    return path.basename(quotedFile[1].trim());
  }

  const bareFile = input.match(/\b([^\s\\/:*?"<>|]+\.[A-Za-z0-9]{1,8})\b/);
  if (bareFile?.[1]) {
    return path.basename(bareFile[1].trim());
  }

  if (/\bfile\s*\.?\s*txt\b/i.test(input)) {
    return 'file.txt';
  }

  if (/\btesto\b/i.test(input) || /\bpoesia\b/i.test(input)) {
    return 'file.txt';
  }

  return '';
}

function inferRequestedFileSaveTarget(text) {
  const input = String(text || '').trim();
  if (!input) return null;

  const lower = input.toLowerCase();
  const mentionsFile = /(\bfile\b|\btxt\b|\.txt\b|\bsalva\b|\bcrea\b)/i.test(input);
  if (!mentionsFile) {
    return null;
  }

  const explicitPath = extractPathFromText(input);
  if (explicitPath && /\.[A-Za-z0-9]{1,8}$/.test(explicitPath)) {
    return {
      dir: path.dirname(explicitPath),
      fileName: path.basename(explicitPath),
      targetPath: explicitPath,
    };
  }

  const fileName = extractRequestedFileName(input);
  if (!fileName) {
    return null;
  }

  const targetDir = extractPathFromText(input)
    || (lower.includes('desktop') ? path.join(process.env.USERPROFILE || '', 'Desktop') : '');

  if (!targetDir) {
    return null;
  }

  return {
    dir: targetDir,
    fileName,
    targetPath: path.join(targetDir, fileName),
  };
}

function extractUrlFromText(text) {
  const input = String(text || '').trim();
  if (!input) return '';

  const directUrl = input.match(/\bhttps?:\/\/[^\s"'<>()]+/i);
  if (directUrl?.[0]) {
    return directUrl[0].replace(/[),.;!?]+$/, '');
  }

  const bareDomain = input.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s"'<>()]*)?/i);
  if (bareDomain?.[0]) {
    return bareDomain[0].replace(/[),.;!?]+$/, '');
  }

  return '';
}

function buildRequestedWordText(text, requestedWords) {
  const target = Math.max(20, Math.min(160, requestedWords || 100));
  const cleanTopic = normalizeLine(String(text || '').replace(/\s+/g, ' '), 120);
  const seedSentences = [
    'Questa nota serve per provare la canvas interattiva di Nyx in modo semplice e diretto.',
    'Puoi copiare, incollare, modificare e riutilizzare questo testo come base per appunti rapidi.',
    `La richiesta originale era: ${cleanTopic || 'testo di prova per la canvas'}.`,
    'Il contenuto e scritto in italiano, scorre bene e rimane adatto a test di copia e incolla.',
    'Se vuoi, nel prossimo passaggio posso trasformarlo in una lista, un riassunto o un prompt operativo.',
  ];

  const words = [];
  let sentenceIndex = 0;
  while (words.length < target) {
    const sentence = seedSentences[sentenceIndex % seedSentences.length];
    words.push(...sentence.split(/\s+/).filter(Boolean));
    sentenceIndex += 1;
  }

  return words.slice(0, target).join(' ');
}

function sanitizeCanvasValueFromSpeech(text) {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return '';

  const actionLines = [
    /^(apro|aperta|ti apro|apro la|apro il|mostro|ti mostro|ecco|fatto)\b/i,
    /\bcanvas\b/i,
    /\bcopia e incolla\b/i,
    /\bpronto da copiare\b/i,
  ];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !actionLines.some((pattern) => pattern.test(item)));

  const merged = normalizeSpeechText(sentences.join(' '));
  return merged.length >= 60 ? merged : '';
}

function inferCanvasDirectiveFromUserInput(userText, responseSpeech, sequence = []) {
  if (!ENABLE_LIVE_CANVAS) return null;
  if (hasCanvasDirective(sequence)) return null;

  const input = String(userText || '').trim();
  if (!input) return null;

  const lower = input.toLowerCase();
  const hasAny = (...phrases) => phrases.some((phrase) => lower.includes(phrase));
  const asksOpen = hasAny('apri', 'aprim', 'mostra', 'mostrami', 'fammi vedere', 'visualizza', 'dammi', 'metti');
  const mentionsCanvas = hasAny('canvas', 'canva', 'live canvas', 'livecanva', 'livecnava', 'lavagna', 'workspace laterale', 'riquadro laterale');
  const asksSplit = hasAny('split', 'dividi', 'metà', 'meta', 'mezzo schermo', 'di fianco', 'fianco', 'a destra', 'destra');
  const asksClipboard = hasAny('clipboard', 'copia e incolla', 'copia/incolla', 'copiami', 'incollare');
  const asksFiles = hasAny('cartella', 'directory', 'file', 'desktop', 'documenti', 'downloads');
  const asksImage = hasAny('immagine', 'foto', 'png', 'jpg', 'jpeg', 'gif', 'webp');
  const asksVideo = hasAny('video', 'mp4', 'webm', 'mov');
  const asksAudio = hasAny('audio', 'musica', 'mp3', 'wav');
  const asksText = hasAny('testo', 'scrivi', 'appunti', 'nota', 'note', 'riassunto', 'prompt', 'codice');
  const extractedUrl = extractUrlFromText(input);
  const explicitCanvasRequest = mentionsCanvas || (asksOpen && (asksClipboard || asksFiles || asksImage || asksVideo || asksAudio || asksText));

  if (!explicitCanvasRequest) {
    return null;
  }

  const layout = asksSplit ? 'split-50' : 'right-docked';

  if (asksFiles) {
    const resolvedPath = extractPathFromText(input);
    return {
      action: 'open',
      layout,
      content: {
        type: 'files',
        title: 'File',
        ...(resolvedPath ? { path: resolvedPath } : {}),
      },
    };
  }

  if (asksImage || asksVideo || asksAudio) {
    const resolvedPath = extractPathFromText(input);
    const type = asksVideo ? 'video' : (asksAudio ? 'audio' : 'image');
    return {
      action: 'open',
      layout,
      content: {
        type,
        title: type.charAt(0).toUpperCase() + type.slice(1),
        ...(resolvedPath ? { path: resolvedPath } : {}),
        ...(resolvedPath ? { src: toFileHref(resolvedPath) } : {}),
      },
    };
  }

  if (asksClipboard || asksText || mentionsCanvas) {
    const requestedWords = extractRequestedWordCount(input);
    const inferredValue = sanitizeCanvasValueFromSpeech(responseSpeech)
      || (requestedWords ? buildRequestedWordText(input, requestedWords) : '');
    return {
      action: 'open',
      layout,
      content: {
        type: asksClipboard ? 'clipboard' : 'text',
        title: asksClipboard ? 'Clipboard' : 'Testo',
        value: inferredValue,
      },
    };
  }

  return {
    action: 'open',
    layout,
    content: {
      type: 'text',
      title: 'Canvas',
      value: sanitizeCanvasValueFromSpeech(responseSpeech),
    },
  };
}

function applyWorkspaceUpdate(directive = {}) {
  const fileName = String(directive.file || '').trim();
  if (!WORKSPACE_MUTABLE_FILES.includes(fileName)) {
    return { ok: false, error: 'Workspace update non consentito per questo file.' };
  }

  const filePath = getWorkspaceFilePath(fileName);
  const content = normalizeSpeechText(String(directive.content || ''));
  if (!content) {
    return { ok: false, error: 'Workspace update senza contenuto.' };
  }

  const current = readTextFile(filePath, '');
  if (current.includes(content)) {
    refreshWorkspaceState();
    broadcastStatus();
    return { ok: true, skipped: true, file: fileName, path: filePath };
  }

  const mode = String(directive.mode || 'append').trim().toLowerCase();
  let nextText = current;

  if (mode === 'replace') {
    nextText = content.endsWith('\n') ? content : `${content}\n`;
  } else {
    const prefix = current.trim() ? '\n\n' : '';
    nextText = `${current.trimEnd()}${prefix}${buildWorkspaceUpdateBlock(directive)}`.trimEnd() + '\n';
  }

  writeTextFile(filePath, nextText);
  refreshWorkspaceState();
  broadcastStatus();
  return { ok: true, file: fileName, path: filePath };
}



function inferBrowserDirectiveFromUserInput(userText, sequence = []) {
  if (!Array.isArray(sequence)) return null;
  if (sequence.some((item) => item?.type === 'browser')) return null;

  const input = String(userText || '').trim();
  if (!input) return null;

  const lower = input.toLowerCase();
  const hasAny = (...phrases) => phrases.some((phrase) => lower.includes(phrase));
  const asksBrowser = hasAny(
    'browser',
    'pinchtab',
    'pagina web',
    'sito',
    'siti',
    'url',
    'link',
    'chrome',
    'edge',
    'web',
    'naviga',
    'vai su',
    'apri il sito',
    'apri la pagina',
  );
  const extractedUrl = extractUrlFromText(input);

  if ((!asksBrowser && !extractedUrl) || isLikelyComputerTask(input)) {
    return null;
  }

  const targetUrl = extractedUrl || input;
  return {
    action: 'open',
    layout: baNormalizeCanvasLayout('right-docked'),
    title: baBuildBrowserTitleFromUrl(targetUrl),
    url: targetUrl,
  };
}

function isLikelyComputerTask(userText) {
  const input = String(userText || '').trim().toLowerCase();
  if (!input) return false;

  const nativeKeywords = [
    'blocco note',
    'notepad',
    'calc',
    'calcolatrice',
    'paint',
    'powershell',
    'cmd',
    'terminale',
    'esplora file',
    'file explorer',
    'desktop',
    'finestra',
    'finestre',
    'applicazione',
    'programma',
    'scrivi',
    'digita',
    'premi',
    'tasto',
    'hotkey',
    'mouse',
    'clic destro',
    'clic sinistro',
    '.exe',
  ];

  return nativeKeywords.some((keyword) => input.includes(keyword));
}

function isSaveDialogWindowTitle(title) {
  const normalized = String(title || '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes('salva con nome')
    || normalized.includes('save as')
    || normalized.includes('salva')
    || normalized.includes('save');
}

function isRequestCancelled(requestId) {
  return !activeChatRequest || activeChatRequest.id !== requestId || Boolean(activeChatRequest.cancelled);
}

function buildActState(input, fallbackText = '') {
  const fallback = inferAvatarReaction(fallbackText);
  const emotion = normalizeEmotion(input?.emotion, fallback.emotion);
  const defaults = EMOTION_TO_AVATAR_STYLE[emotion] || EMOTION_TO_AVATAR_STYLE.neutral;
  const expression = normalizeExpression(input?.expression, defaults.expression || emotion);
  const explicitMotion = extractExplicitMotion(input);
  const fallbackMotion = extractExplicitMotion({ motion: fallback.motion, motionType: fallback.motionType });
  const defaultMotion = extractExplicitMotion({ motion: defaults.motion, motionType: defaults.motionType });
  const hasResolvedMotion = explicitMotion.pose || explicitMotion.animation || explicitMotion.gesture || explicitMotion.motion;
  const selectedMotion = (explicitMotion.motionSpecified && hasResolvedMotion)
    ? explicitMotion
    : (fallbackMotion.motion ? fallbackMotion : defaultMotion);
  const intensity = clampIntensity(input?.intensity, fallback.intensity);
  const pose = selectedMotion.pose || null;
  const animation = selectedMotion.animation || null;
  const gesture = selectedMotion.gesture || null;
  const motion = gesture || animation || pose || selectedMotion.motion || null;
  const motionType = gesture
    ? 'gesture'
    : animation
      ? 'animation'
      : pose
        ? 'pose'
        : selectedMotion.motionType;

  return {
    emotion,
    mood: defaults.mood || 'neutral',
    expression,
    pose,
    animation,
    gesture,
    gestureHand: selectedMotion.gestureHand || null,
    direction: selectedMotion.direction || null,
    motion,
    motionType,
    intensity,
  };
}

function buildAvatarAnimationPlan(style, segmentText = '') {
  const merged = buildActState(style, segmentText);
  const effectiveMotion = merged.motion === 'turnwalk' ? 'walking' : merged.motion;
  const effectiveMotionType = merged.motion === 'turnwalk' ? 'animation' : merged.motionType;
  const baseDurationMap = {
    handup: 4,
    ok: 3,
    index: 4,
    thumbup: 4,
    thumbdown: 4,
    side: 4,
    shrug: 4,
    namaste: 5,
    dance: 12,
    walking: 10,
    turnwalk: 2,
    sitting: 999999,
    kneel: 999999,
    oneknee: 999999,
    bend: 999999,
    straight: 6,
  };

  const motionDuration = Math.max(3, Math.round((baseDurationMap[effectiveMotion] || 4) * (0.7 + merged.intensity)));
  const shouldResetMotion = Boolean(effectiveMotion) && effectiveMotionType === 'gesture';

  return {
    ...merged,
    motion: effectiveMotion,
    motionType: effectiveMotionType,
    motionDuration,
    shouldResetMotion,
    resetMotion: shouldResetMotion ? 'straight' : null,
    resetMotionType: shouldResetMotion ? 'pose' : null,
  };
}

function parseReasoningSegments(raw) {
  const segments = [];
  for (const tagName of REASONING_TAG_NAMES) {
    const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'gi');
    let match = regex.exec(raw);
    while (match) {
      segments.push(match[1].trim());
      match = regex.exec(raw);
    }
  }
  return segments.filter(Boolean);
}

function stripTrailingIncompleteControls(raw) {
  let output = String(raw || '');
  output = output.replace(/<\|[^|>]*$/g, '');

  for (const tagName of REASONING_TAG_NAMES) {
    const incompleteTag = new RegExp(`<${tagName}(?:[^>]*)>(?![\\s\\S]*?</${tagName}>)`, 'i');
    const match = output.match(incompleteTag);
    if (match?.index != null) {
      output = output.slice(0, match.index);
    }
  }

  return output;
}

function extractSpeechPreview(raw) {
  let preview = stripTrailingIncompleteControls(String(raw || ''));
  preview = preview.replace(/<\|ACT[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|CANVAS[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|BROWSER[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|WORKSPACE[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|DELAY:\s*\d+(?:\.\d+)?\|>/gi, '');

  for (const tagName of REASONING_TAG_NAMES) {
    const regex = new RegExp(`<${tagName}>[\\s\\S]*?</${tagName}>`, 'gi');
    preview = preview.replace(regex, '');
  }

  return normalizeSpeechText(preview);
}

function parseJsonToolCalls(text) {
  const raw = String(text || '');
  const sanitizedRaw = sanitizeModelJsonEnvelope(raw);
  const extractSegmentsFromJsonEnvelope = (json) => {
    const nextSegments = [];
    const segmentList = Array.isArray(json?.segments)
      ? json.segments
      : Array.isArray(json?.timeline)
        ? json.timeline
        : Array.isArray(json?.steps)
          ? json.steps
          : null;
    const pushSpeech = (value) => {
      const textValue = normalizeSpeechText(value);
      if (textValue) nextSegments.push({ type: 'speech', text: textValue });
    };
    const pushTool = (toolName, argsValue) => {
      if (!toolName || argsValue === undefined) return;
      nextSegments.push({
        type: 'tool',
        tool: {
          tool: String(toolName || '').trim(),
          args: argsValue && typeof argsValue === 'object' ? argsValue : {},
        },
      });
    };
    const pushAvatar = (segment) => {
      if (!segment || typeof segment !== 'object') return;
      nextSegments.push({
        type: 'avatar',
        state: {
          emotion: segment.emotion,
          gesture: segment.gesture,
          hand: segment.hand,
          gestureHand: segment.gestureHand,
          side: segment.side,
          gestureSide: segment.gestureSide,
          direction: segment.direction,
          pose: segment.pose,
          animation: segment.animation,
          motion: segment.motion,
          motionType: segment.motionType,
          expression: segment.expression,
          intensity: segment.intensity,
          cognitive: segment.cognitive,
          intent: segment.intent,
          actions: segment.actions,
        },
      });
    };

    if (json && typeof json === 'object' && Array.isArray(segmentList)) {
      for (const segment of segmentList) {
        if (!segment || typeof segment !== 'object') continue;
        if (segment.type === 'speech') {
          pushSpeech(segment.text);
          continue;
        }
        if (segment.type === 'avatar') {
          pushAvatar(segment);
          continue;
        }
        if (segment.type === 'tool' || segment.type === 'action') {
          pushTool(segment.tool, segment.args);
          continue;
        }
      }
      return nextSegments;
    }

    if (json && typeof json === 'object') {
      const preSpeech = json.preActionSpeech ?? json.pre_action_speech;
      const postSpeech = json.postActionSpeech ?? json.post_action_speech;
      const speech = json.speech ?? json.text ?? json.message;
      if (preSpeech !== undefined) pushSpeech(preSpeech);
      if (json.tool && json.args !== undefined) {
        pushTool(json.tool, json.args);
      } else if (Array.isArray(json.tools)) {
        for (const toolItem of json.tools) {
          if (!toolItem || typeof toolItem !== 'object') continue;
          pushTool(toolItem.tool, toolItem.args);
        }
      }
      if (postSpeech !== undefined) {
        pushSpeech(postSpeech);
      } else if (speech !== undefined) {
        pushSpeech(speech);
      }
    }

    return nextSegments;
  };

  const summarizeSegments = (segments) => {
    const tools = [];
    const speechParts = [];
    const isActionSegment = (segment) => segment?.type === 'tool' || segment?.type === 'avatar';
    for (const segment of segments) {
      if (segment?.type === 'speech' && segment.text) {
        speechParts.push(segment.text);
      } else if (segment?.type === 'tool' && segment.tool) {
        tools.push(segment.tool);
      }
    }
    const speech = speechParts.join(' ').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
    const firstToolIndex = segments.findIndex((segment) => isActionSegment(segment));
    const preActionSpeech = segments
      .slice(0, firstToolIndex >= 0 ? firstToolIndex : segments.length)
      .filter((segment) => segment.type === 'speech')
      .map((segment) => segment.text)
      .join(' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    const postActionSpeech = (firstToolIndex >= 0 ? segments.slice(firstToolIndex + 1) : [])
      .filter((segment) => segment.type === 'speech')
      .map((segment) => segment.text)
      .join(' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    return {
      matchedJson: segments.length > 0,
      tools,
      speech,
      segments,
      preActionSpeech,
      postActionSpeech,
    };
  };

  const rootJsonResult = raw.startsWith('{') || raw.startsWith('[')
    ? tryParseJsonAt(raw, 0)
    : null;
  if (rootJsonResult && rootJsonResult.endIndex === raw.length) {
    const rootSegments = extractSegmentsFromJsonEnvelope(rootJsonResult.json);
    if (rootSegments.length > 0) {
      return summarizeSegments(rootSegments);
    }
  }

  if (sanitizedRaw) {
    const sanitizedRootResult = sanitizedRaw.startsWith('{') || sanitizedRaw.startsWith('[')
      ? tryParseJsonAt(sanitizedRaw, 0)
      : null;
    if (sanitizedRootResult && sanitizedRootResult.endIndex === sanitizedRaw.length) {
      const sanitizedSegments = extractSegmentsFromJsonEnvelope(sanitizedRootResult.json);
      if (sanitizedSegments.length > 0) {
        return summarizeSegments(sanitizedSegments);
      }
    }

    const sanitizedLoose = parseLooseJsonObject(sanitizedRaw);
    if (sanitizedLoose && typeof sanitizedLoose === 'object') {
      const looseSegments = extractSegmentsFromJsonEnvelope(sanitizedLoose);
      if (looseSegments.length > 0) {
        return summarizeSegments(looseSegments);
      }
    }
  }

  const tools = [];
  const speechParts = [];
  const segments = [];
  let lastIndex = 0;

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '{') continue;

    // Try to find a complete JSON block starting at position i
    const jsonResult = tryParseJsonAt(raw, i);
    if (!jsonResult) continue;

    const { json, endIndex } = jsonResult;

    // Check if this JSON contains tool definitions
    if (json && typeof json === 'object') {
      const extractedTools = extractToolsFromJson(json);
      if (extractedTools.length > 0) {
        // Add speech before the JSON block
        const beforeText = raw.slice(lastIndex, i).trim();
        if (beforeText) {
          speechParts.push(beforeText);
          segments.push({ type: 'speech', text: beforeText });
        }

        tools.push(...extractedTools);
        for (const extractedTool of extractedTools) {
          segments.push({ type: 'tool', tool: extractedTool });
        }
        lastIndex = endIndex;
        i = endIndex - 1;
        continue;
      }
    }
  }

  // Add remaining text as speech
  const afterText = raw.slice(lastIndex).trim();
  if (afterText) {
    speechParts.push(afterText);
    segments.push({ type: 'speech', text: afterText });
  }

  return {
    matchedJson: tools.length > 0,
    tools,
    speech: speechParts.join(' ').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim(),
    segments,
    preActionSpeech: segments
      .slice(0, segments.findIndex((segment) => segment.type === 'tool') >= 0 ? segments.findIndex((segment) => segment.type === 'tool') : segments.length)
      .filter((segment) => segment.type === 'speech')
      .map((segment) => segment.text)
      .join(' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
    postActionSpeech: (() => {
      const firstToolIndex = segments.findIndex((segment) => segment.type === 'tool');
      return (firstToolIndex >= 0 ? segments.slice(firstToolIndex + 1) : [])
        .filter((segment) => segment.type === 'speech')
        .map((segment) => segment.text)
        .join(' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
    })(),
  };
}

function tryParseJsonAt(text, startPos) {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startPos; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{' || char === '[') {
      depth++;
    } else if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) {
        // Found complete JSON block
        const jsonStr = text.slice(startPos, i + 1);
        try {
          return { json: JSON.parse(jsonStr), endIndex: i + 1 };
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function extractToolsFromJson(json) {
  const tools = [];

  if (json.tool && json.args !== undefined) {
    tools.push({ tool: json.tool, args: json.args });
  } else if (Array.isArray(json.segments)) {
    for (const segment of json.segments) {
      if (segment && typeof segment === 'object' && (segment.type === 'tool' || segment.type === 'action') && segment.tool && segment.args !== undefined) {
        tools.push({ tool: segment.tool, args: segment.args });
      }
    }
  } else if (json.tools && Array.isArray(json.tools)) {
    for (const t of json.tools) {
      if (t.tool && t.args !== undefined) {
        tools.push({ tool: t.tool, args: t.args });
      }
    }
  }

  return tools;
}

function mapJsonToolToSequence(jsonTool) {
  const { tool, args } = jsonTool;
  if (!tool || !args || typeof args !== 'object') return null;

  switch (tool) {
    case 'read_file':
      return { type: 'read_file', directive: { path: String(args.path || ''), startLine: args.startLine, endLine: args.endLine } };
    case 'write_file':
      return { type: 'write_file', directive: { path: String(args.path || ''), content: String(args.content || ''), overwrite: Boolean(args.overwrite) } };
    case 'edit_file':
      return { type: 'edit_file', directive: { path: String(args.path || ''), oldString: String(args.oldString || ''), newString: String(args.newString || ''), replaceAll: Boolean(args.replaceAll), regex: Boolean(args.regex) } };
    case 'apply_patch':
      return { type: 'apply_patch', directive: { path: String(args.path || ''), oldText: String(args.oldText || ''), newText: String(args.newText || ''), replaceAll: Boolean(args.replaceAll) } };
    case 'shell':
      return { type: 'shell', directive: { command: String(args.command || ''), cwd: args.cwd, timeout: args.timeout, background: Boolean(args.background) } };
    case 'glob':
      return { type: 'glob', directive: { pattern: String(args.pattern || ''), path: args.path } };
    case 'grep':
      return { type: 'grep', directive: { pattern: String(args.pattern || ''), path: args.path, include: args.include } };
    case 'multi_file_read':
      return { type: 'multi_file_read', directive: { files: Array.isArray(args.files) ? args.files : [] } };
    case 'git':
      return { type: 'git', directive: { action: String(args.action || 'status'), params: args.params || {}, cwd: args.cwd } };
    case 'web_fetch':
      return { type: 'web_fetch', directive: { url: String(args.url || ''), format: args.format } };
    case 'web_search':
      return { type: 'web_search', directive: { query: String(args.query || ''), numResults: args.numResults } };
    case 'memory_search':
      return { type: 'memory_search', directive: { query: String(args.query || ''), scope: String(args.scope || 'all') } };
    case 'task':
      return { type: 'task', directive: { action: String(args.action || 'list'), params: args.params || {} } };
    case 'delay':
      return { type: 'delay', seconds: Math.min(3, Math.max(0, Number(args.seconds) || 0)) };
    case 'browser':
      return { type: 'browser', directive: { action: String(args.action || ''), url: args.url, ref: args.ref, text: args.text, key: args.key, waitAfterMs: args.waitAfterMs } };
    case 'computer':
      return { type: 'computer', directive: { action: String(args.action || ''), titleContains: args.titleContains, app: args.app, text: args.text, combo: args.combo } };
    case 'canvas':
      return { type: 'canvas', directive: { action: String(args.action || ''), layout: args.layout, content: args.content } };
    case 'workspace':
      return { type: 'workspace', directive: { file: String(args.file || ''), mode: String(args.mode || 'append'), content: String(args.content || '') } };
    default:
      return null;
  }
}

function buildParsedResponseFromJsonSegments(jsonSegments, raw, fallbackInput, reasoning = '', options = {}) {
  const sequence = [];
  let firstAvatarState = null;

  for (const segment of Array.isArray(jsonSegments) ? jsonSegments : []) {
    if (segment.type === 'speech') {
      const text = normalizeSpeechText(segment.text);
      if (text) {
        sequence.push({ type: 'speech', text });
      }
      continue;
    }

    if (segment.type === 'avatar' && segment.state) {
      const avatarState = parseActPayload(JSON.stringify(segment.state), fallbackInput);
      if (avatarState) {
        const item = { type: 'avatar', ...avatarState };
        if (!firstAvatarState) firstAvatarState = item;
        sequence.push(item);
      }
      continue;
    }

    if (segment.type !== 'tool' || !segment.tool) continue;
    const item = mapJsonToolToSequence(segment.tool);
    if (!item) continue;
    sequence.push(item);
  }

  const speech = sequence
    .filter((item) => item.type === 'speech' && item.text)
    .map((item) => item.text)
    .join(' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (!firstAvatarState) {
    const emojiEmotion = resolveEmotionFromEmoji(raw);
    if (emojiEmotion) {
      const style = EMOTION_TO_AVATAR_STYLE[emojiEmotion] || EMOTION_TO_AVATAR_STYLE.neutral;
      firstAvatarState = {
        type: 'avatar',
        emotion: emojiEmotion,
        intensity: 0.72,
        pose: null,
        animation: null,
        gesture: style.motionType === 'gesture' ? style.motion : null,
        gestureHand: null,
        motion: style.motion,
        motionType: style.motionType,
        expression: style.expression,
        motionSpecified: !!style.motion,
      };
      sequence.unshift(firstAvatarState);
    }
  }

  return {
    format: options.format || 'json',
    raw,
    speech,
    preActionSpeech: normalizeSpeechText(options.preActionSpeech || ''),
    postActionSpeech: normalizeSpeechText(options.postActionSpeech || ''),
    reasoning,
    sequence,
    firstAvatarState,
    firstActState: firstAvatarState,
    fallbackText: fallbackInput,
  };
}

function buildParsedResponseFromSequenceChunk(baseResponse, sequenceChunk = [], fallbackInput = '') {
  const sequence = Array.isArray(sequenceChunk) ? sequenceChunk.filter(Boolean) : [];
  const speech = sequence
    .filter((item) => item.type === 'speech' && item.text)
    .map((item) => item.text)
    .join(' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const firstAvatarState = sequence.find((item) => item.type === 'avatar' || item.type === 'act') || null;

  return {
    ...(baseResponse || {}),
    speech,
    sequence,
    firstAvatarState: firstAvatarState || baseResponse?.firstAvatarState || null,
    firstActState: firstAvatarState || baseResponse?.firstActState || null,
    fallbackText: fallbackInput || baseResponse?.fallbackText || '',
  };
}

function normalizeLegacyResponseToPhasePlan(response, fallbackInput = '') {
  const phases = [];
  const sequence = Array.isArray(response?.sequence) ? response.sequence : [];
  let currentMessageItems = [];
  let currentToolItems = [];
  let phaseCounter = 0;

  const flushMessage = () => {
    if (!currentMessageItems.length) return;
    phaseCounter += 1;
    phases.push({
      phaseId: `phase-${phaseCounter}`,
      kind: 'message',
      response: buildParsedResponseFromSequenceChunk(response, currentMessageItems, fallbackInput),
    });
    currentMessageItems = [];
  };

  const flushTools = () => {
    if (!currentToolItems.length) return;
    phaseCounter += 1;
    phases.push({
      phaseId: `phase-${phaseCounter}`,
      kind: 'tool_batch',
      sequence: currentToolItems.slice(),
    });
    currentToolItems = [];
  };

  for (const item of sequence) {
    const isMessageItem = ['speech', 'avatar', 'act', 'delay'].includes(item?.type);
    if (isMessageItem) {
      flushTools();
      currentMessageItems.push(item);
    } else {
      flushMessage();
      currentToolItems.push(item);
    }
  }

  flushMessage();
  flushTools();

  if (!phases.length) {
    phases.push({
      phaseId: 'phase-1',
      kind: 'final',
      response: buildParsedResponseFromSequenceChunk(response, sequence, fallbackInput),
    });
  } else if (!phases.some((phase) => phase.kind === 'tool_batch')) {
    phases[phases.length - 1].kind = 'final';
  }

  return {
    format: 'legacy',
    raw: response?.raw || '',
    reasoning: response?.reasoning || '',
    phases,
    response,
  };
}

function parsePhasePlan(rawOutput, fallbackInput, options = {}) {
  const raw = String(rawOutput || '').replace(/\r/g, '').trim();
  const reasoning = parseReasoningSegments(raw).join('\n\n');
  const sanitizedRaw = sanitizeModelJsonEnvelope(raw);
  const tryRootObject = (source) => {
    if (!source) return null;
    const direct = (source.startsWith('{') || source.startsWith('[')) ? tryParseJsonAt(source, 0) : null;
    if (direct && direct.endIndex === source.length && direct.json && typeof direct.json === 'object' && !Array.isArray(direct.json)) {
      return direct.json;
    }
    const loose = parseLooseJsonObject(source);
    return loose && typeof loose === 'object' && !Array.isArray(loose) ? loose : null;
  };

  const root = tryRootObject(raw) || tryRootObject(sanitizedRaw);
  if (!root || !Array.isArray(root.phases)) {
    const response = parseInlineResponse(rawOutput, fallbackInput, options);
    return normalizeLegacyResponseToPhasePlan(response, fallbackInput);
  }

  const phases = [];
  root.phases.forEach((phase, index) => {
    if (!phase || typeof phase !== 'object') return;
    const kind = String(phase.kind || phase.type || 'message').trim().toLowerCase();
    const phaseId = String(phase.phaseId || phase.id || `phase-${index + 1}`).trim() || `phase-${index + 1}`;

    if (kind === 'status') {
      const statusText = normalizeSpeechText(String(phase.text || phase.message || ''));
      if (statusText) {
        phases.push({
          phaseId,
          kind: 'status',
          statusText,
          speak: phase.speak === true || phase.tts === true || phase.voice === true,
        });
      }
      return;
    }

    const segmentList = Array.isArray(phase.segments)
      ? phase.segments
      : Array.isArray(phase.timeline)
        ? phase.timeline
        : Array.isArray(phase.steps)
          ? phase.steps
          : [];

    const parsedResponse = buildParsedResponseFromJsonSegments(
      segmentList.map((segment) => {
        if (!segment || typeof segment !== 'object') return null;
        if (segment.type === 'avatar') {
          return {
            type: 'avatar',
            state: {
              emotion: segment.emotion,
              gesture: segment.gesture,
              hand: segment.hand,
              gestureHand: segment.gestureHand,
              side: segment.side,
              gestureSide: segment.gestureSide,
              direction: segment.direction,
              pose: segment.pose,
              animation: segment.animation,
              motion: segment.motion,
              motionType: segment.motionType,
              expression: segment.expression,
              intensity: segment.intensity,
              cognitive: segment.cognitive,
              intent: segment.intent,
              actions: segment.actions,
            },
          };
        }
        if (segment.type === 'speech') return { type: 'speech', text: segment.text };
        if (segment.type === 'tool' || segment.type === 'action') {
          return { type: 'tool', tool: { tool: segment.tool, args: segment.args || {} } };
        }
        return null;
      }).filter(Boolean),
      raw,
      fallbackInput,
      reasoning,
      { format: 'phases' }
    );

    if (kind === 'tool_batch') {
      phases.push({
        phaseId,
        kind,
        sequence: Array.isArray(parsedResponse.sequence) ? parsedResponse.sequence.filter((item) => item.type && item.type !== 'speech' && item.type !== 'avatar' && item.type !== 'act' && item.type !== 'delay') : [],
      });
      return;
    }

    if (kind === 'blocked') {
      phases.push({ phaseId, kind, response: parsedResponse, shouldPause: true });
      return;
    }

    if (kind === 'final') {
      phases.push({ phaseId, kind: 'final', response: parsedResponse });
      return;
    }

    phases.push({ phaseId, kind: 'message', response: parsedResponse });
  });

  if (!phases.length) {
    const response = parseInlineResponse(rawOutput, fallbackInput, options);
    return normalizeLegacyResponseToPhasePlan(response, fallbackInput);
  }

  return {
    format: 'phases',
    raw,
    reasoning,
    phases,
  };
}

function parseInlineResponse(rawOutput, fallbackInput, options = {}) {
  const raw = String(rawOutput || '').replace(/\r/g, '').trim();
  const reasoning = parseReasoningSegments(raw).join('\n\n');

  // JSON-only mode: no legacy token fallback
  const {
    matchedJson,
    tools: jsonTools,
    speech: jsonSpeech,
    segments: jsonSegments,
    preActionSpeech: jsonPreActionSpeech,
    postActionSpeech: jsonPostActionSpeech,
  } = parseJsonToolCalls(raw);

  if (matchedJson) {
    return buildParsedResponseFromJsonSegments(jsonSegments, raw, fallbackInput, reasoning, {
      format: 'json',
      preActionSpeech: jsonPreActionSpeech,
      postActionSpeech: jsonPostActionSpeech,
    });
  }

  // No JSON matched — treat entire response as speech
  const speechText = normalizeSpeechText(
    parseStructuredField(raw, 'ASSISTANT_TEXT') || raw
  );

  // Emoji-based emotion inference (no ACT tokens needed)
  const emojiEmotion = resolveEmotionFromEmoji(raw);
  const firstAvatarState = emojiEmotion
    ? {
        type: 'avatar',
        emotion: emojiEmotion,
        intensity: 0.72,
        motion: EMOTION_TO_AVATAR_STYLE[emojiEmotion]?.motion || null,
        motionType: EMOTION_TO_AVATAR_STYLE[emojiEmotion]?.motionType || null,
        expression: EMOTION_TO_AVATAR_STYLE[emojiEmotion]?.expression || emojiEmotion,
        motionSpecified: false,
      }
    : null;

  return {
    format: 'json',
    raw,
    speech: speechText,
    reasoning,
    sequence: [
      ...(firstAvatarState ? [firstAvatarState] : []),
      { type: 'speech', text: speechText },
    ],
    firstAvatarState,
    firstActState: firstAvatarState,
  };
}

function estimateSpeechDurationMs(text, audioBase64) {
  try {
    if (audioBase64) {
      const wav = Buffer.from(audioBase64, 'base64');
      if (wav.slice(0, 4).toString('ascii') === 'RIFF' && wav.slice(8, 12).toString('ascii') === 'WAVE' && wav.length > 44) {
        const channels = wav.readUInt16LE(22);
        const sampleRate = wav.readUInt32LE(24);
        const bitsPerSample = wav.readUInt16LE(34);
        const dataSize = wav.readUInt32LE(40);
        const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
        if (bytesPerSecond > 0) {
          return Math.max(600, Math.round((dataSize / bytesPerSecond) * 1000));
        }
      }
    }
  } catch {
    // fallback below
  }

  return Math.max(1200, Math.min(String(text || '').length * 90, 15000));
}

async function waitWhileActive(requestId, ms) {
  let remaining = Math.max(0, ms);
  while (remaining > 0) {
    if (activeResponseId !== requestId) {
      return false;
    }
    const step = Math.min(remaining, 120);
    // eslint-disable-next-line no-await-in-loop
    await sleep(step);
    remaining -= step;
  }

  return activeResponseId === requestId;
}

async function playSequentialMoods(requestId, moods, speechText) {
  const totalDuration = estimateSpeechDurationMs(speechText);
  const intervalMs = Math.max(1500, totalDuration / moods.length);

  for (let i = 0; i < moods.length; i++) {
    if (activeResponseId !== requestId) return;
    const mood = moods[i];
    sendAvatarCommand({ cmd: 'mood', mood: mood.mood });
    sendAvatarCommand({ cmd: 'expression', expression: mood.expression });
    if (i < moods.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(intervalMs);
    }
  }
}

async function playMultiActions(requestId, actions) {
  for (const action of actions) {
    if (activeResponseId !== requestId) return;
    if (action.delay) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(action.delay * 1000);
    }
    sendAvatarCommand({ cmd: 'expression', expression: action.expression || 'neutral' });
    playAvatarMotions(action, 4);
    if (action.emotion && action.emotion !== 'neutral') {
      sendAvatarCommand({ cmd: 'mood', mood: action.emotion });
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(800);
  }
}

function sanitizeModelJsonEnvelope(source) {
  let text = String(source || '').trim();
  if (!text) return '';

  text = text.replace(/```(?:json)?/gi, '').trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  return text
    .replace(/"type"\s*:\s*"tool"\s*:\s*"([^"]+)"/gi, '"type":"tool","tool":"$1"')
    .replace(/"type"\s*:\s*"action"\s*:\s*"([^"]+)"/gi, '"type":"action","tool":"$1"')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function playAvatarMotions(style, duration) {
  if (!style) return;

  if (style.pose) {
    sendAvatarCommand({
      cmd: 'motion',
      motion: style.pose,
      motionType: 'pose',
      duration,
    });
  }

  if (style.animation) {
    sendAvatarCommand({
      cmd: 'motion',
      motion: style.animation,
      motionType: 'animation',
      duration,
    });
  }

  if (style.gesture) {
    sendAvatarCommand({
      cmd: 'motion',
      motion: style.gesture,
      motionType: 'gesture',
      duration,
      hand: style.gestureHand || null,
    });
    return;
  }

  if (style.motion) {
    sendAvatarCommand({
      cmd: 'motion',
      motion: style.motion,
      motionType: style.motionType,
      duration,
      direction: style.direction || null,
    });
  }
}

async function settleAvatarMotion(requestId, style) {
  if (!style) return true;
  if (!style.pose && !style.animation) return true;
  if (style.motion === 'turnwalk' || style.animation === 'turnwalk') {
    return waitWhileActive(requestId, 1150);
  }
  return waitWhileActive(requestId, style.animation ? 260 : 180);
}

async function playResponseSequence(requestId, response) {
  activeResponseId = requestId;
  clearSpeechResetTimer();
  sendAvatarCommand({ cmd: 'stop' });

  let currentAct = buildActState(response.firstAvatarState || response.firstActState, response.fallbackText || response.speech);
  const hasSpeechItems = Array.isArray(response.sequence)
    && response.sequence.some((item) => item.type === 'speech' && item.text);

  sendAvatarCommand({ cmd: 'expression', expression: currentAct.expression });

  if (!hasSpeechItems) {
    playAvatarMotions(currentAct, 6);
    if (!(await settleAvatarMotion(requestId, currentAct))) {
      return;
    }

    if (currentAct.sequentialMoods && currentAct.sequentialMoods.length) {
      await playSequentialMoods(requestId, currentAct.sequentialMoods, response.speech);
    }

    if (currentAct.multiAction && currentAct.actions && currentAct.actions.length) {
      await playMultiActions(requestId, currentAct.actions);
    }
  }

  let speechSegmentIndex = 0;
  let typedTextBuffer = '';
  const workspaceMessages = [];
  let speechSegmentsCount = 0;
  let skippedInitialAvatarState = false;

  for (const item of response.sequence) {
    if (activeResponseId !== requestId) {
      return;
    }

    if (item.type === 'avatar' || item.type === 'act') {
      if (!skippedInitialAvatarState && (response.firstAvatarState || response.firstActState)) {
        skippedInitialAvatarState = true;
        continue;
      }
      currentAct = buildActState(item, response.fallbackText || response.speech);
      sendAvatarCommand({ cmd: 'expression', expression: currentAct.expression });

      if (currentAct.sequentialMoods && currentAct.sequentialMoods.length) {
        // eslint-disable-next-line no-await-in-loop
        await playSequentialMoods(requestId, currentAct.sequentialMoods, response.speech);
      }

      if (currentAct.multiAction && currentAct.actions && currentAct.actions.length) {
        // eslint-disable-next-line no-await-in-loop
        await playMultiActions(requestId, currentAct.actions);
      }

      playAvatarMotions(currentAct, buildAvatarAnimationPlan(currentAct, response.speech).motionDuration);
      if (!(await settleAvatarMotion(requestId, currentAct))) {
        return;
      }
      continue;
    }

    if (item.type === 'canvas') {
      // eslint-disable-next-line no-await-in-loop
      await handleCanvasDirective(item.directive);
      continue;
    }

    if (item.type === 'browser') {
      // eslint-disable-next-line no-await-in-loop
      const browserResult = await handleBrowserDirective(item.directive);
      if (browserResult?.ok === false) {
        throw new Error(browserResult.error || 'Errore browser PinchTab');
      }
      continue;
    }

    if (item.type === 'workspace') {
      // eslint-disable-next-line no-await-in-loop
      const workspaceResult = applyWorkspaceUpdate(item.directive);
      if (workspaceResult?.ok === false) {
        throw new Error(workspaceResult.error || 'Errore aggiornamento workspace');
      }
      workspaceMessages.push(buildWorkspaceSavedMessage(workspaceResult));
      continue;
    }

    if (item.type === 'computer') {
      if (item.directive?.action === 'type_text' && item.directive?.text) {
        typedTextBuffer = `${typedTextBuffer}${typedTextBuffer ? '\n' : ''}${item.directive.text}`;
      }

      // eslint-disable-next-line no-await-in-loop
      const computerResult = await handleComputerDirective({
        ...item.directive,
        requestId,
      });
      if (computerResult?.ok === false) {
        throw new Error(computerResult.error || 'Errore computer_use');
      }

      // eslint-disable-next-line no-await-in-loop
      const saveFlowResult = await maybeCompleteComputerFileSaveFlow(response.fallbackText || response.speech || '', typedTextBuffer);
      if (saveFlowResult?.ok === false) {
        throw new Error(`Non sono riuscito a verificare il salvataggio del file in ${saveFlowResult.targetPath}`);
      }
      continue;
    }

    if (item.type === 'delay') {
      // eslint-disable-next-line no-await-in-loop
      const stillActive = await waitWhileActive(requestId, item.seconds * 1000);
      if (!stillActive) {
        return;
      }
      continue;
    }

    if (item.type !== 'speech' || !item.text) {
      continue;
    }

    speechSegmentsCount += 1;

    const plan = buildAvatarAnimationPlan(currentAct, item.text);
    // eslint-disable-next-line no-await-in-loop
    const audioBase64 = await synthesizeSpeechToBase64(item.text);
    if (!audioBase64) {
      continue;
    }

    if (activeResponseId !== requestId) {
      return;
    }

    const segmentId = `segment-${speechSegmentIndex += 1}`;
    const expectedDurationMs = estimateSpeechDurationMs(item.text, audioBase64);
    const playbackWait = waitForAvatarPlayback(requestId, segmentId, expectedDurationMs + 1500);

    playAvatarMotions(plan, plan.motionDuration);
    setStatus('speaking');
    setStreamStatus(STREAM_STATUS.SPEAKING);
    sendAvatarCommand({
      cmd: 'speak',
      text: item.text,
      mood: plan.mood,
      expression: plan.expression,
      audioBase64,
      requestId,
      segmentId,
      expectedDurationMs,
    });

    // eslint-disable-next-line no-await-in-loop
    const stillActive = await playbackWait;
    if (!stillActive) {
      return;
    }

    if (plan.shouldResetMotion && plan.resetMotion) {
      sendAvatarCommand({
        cmd: 'motion',
        motion: plan.resetMotion,
        motionType: plan.resetMotionType,
        duration: 6,
      });
    }
  }

  if (activeResponseId === requestId) {
    activeResponseId = null;
    setStatus('idle');
    setStreamStatus(STREAM_STATUS.CONNECTED);
    setTtsState('idle', { error: null });
  }

  // Update personality based on this interaction
  const lastUserMsg = chatHistory.filter((m) => m.role === 'user').slice(-1)[0];
  const lastAssistantMsg = chatHistory.filter((m) => m.role === 'assistant').slice(-1)[0];
  if (lastUserMsg && lastAssistantMsg) {
    updatePersonality(personalityState, lastUserMsg.text || '', lastAssistantMsg.text || '');
    const personalityPath = path.join(getWorkspacePath(), 'PERSONALITY.md');
    savePersonality(personalityPath, personalityState);
  }

  // Auto-prune if context is getting large
  const stats = getContextStats(chatHistory);
  if (stats.usagePercent > 70) {
    const pruneResult = smartPrune(chatHistory);
    if (pruneResult.action !== 'none') {
      emitSystemChatStream(requestId, `Context pruned: ${pruneResult.pruned} messaggi rimossi.`);
    }
  }

  for (const message of workspaceMessages) {
    appendHistoryMessage(message);
    emitSystemChatStream(requestId, message);
  }
}

function cleanupRuntime() {
  if (cleanupStarted) {
    return;
  }

  cleanupStarted = true;
  clearSpeechResetTimer();

  try {
    activeChatRequest?.streamEmitter?.stop();
  } catch {
    // ignore emitter cleanup errors
  }

  if (activeChatRequest?.proc) {
    try {
      activeChatRequest.proc.kill();
    } catch {
      // ignore process cleanup errors
    }
  }

  activeChatRequest = null;
  resolvePlaybackWaitersForRequest(activeResponseId, false);
  activeResponseId = null;
  setTtsState('idle', { error: null });
  avatarStatusLoop?.stop();
  chatStatusLoop?.stop();
  canvasStatusLoop?.stop();
  avatarStatusLoop = null;
  chatStatusLoop = null;
  canvasStatusLoop = null;

  try {
    sendAvatarCommand({ cmd: 'stop' });
  } catch {
    // ignore avatar cleanup errors
  }

  stopTtsService();
  baStopPinchtabService();
  ccStopPywinautoMcpService();
  stopQwenAcpRuntime();
  resetBrainRuntimeState();

  try {
    wmPersistWindowStateNow(app, wmGetAvatarWindow(), wmGetChatWindow(), wmGetCanvasWindow());
  } catch {
    // ignore persistence errors
  }
}

function buildCurrentSessionContextPrompt() {
  const lines = [];
  if (chatSession.id) {
    lines.push(`SESSION_ID: ${chatSession.id}`);
    lines.push(`SESSION_CREATED: ${chatSession.createdAt || '-'}`);
    lines.push(`SESSION_LAST_USED: ${chatSession.lastUsedAt || '-'}`);
    lines.push(`SESSION_TURNS: ${acpSession.turnCount || 0}`);
    lines.push(`SESSION_COMPACTIONS: ${Number(chatSession.compactionCount || 0)}`);
  }
  return lines.length ? `CURRENT_SESSION:\n${lines.join('\n')}` : '';
}

function buildAutoRecallBlocks(userText) {
  // Simple auto-recall: return empty blocks (no semantic search implemented yet)
  return { memoryRecallBlock: '', sessionRecallBlock: '' };
}

function buildStartupBootPrompt() {
  if (!workspaceState.startupBootPending && !workspaceState.bootstrapPending) return '';
  return [
    'STARTUP_BOOT: attivo.',
    workspaceState.bootstrapPending ? '- Completa il bootstrap del workspace se non fatto.' : '',
    workspaceState.startupBootPending ? '- Applica le istruzioni dal file BOOT.md.' : '',
  ].filter(Boolean).join('\n');
}

function buildBootstrapAcpPrompt(userText, options = {}) {
  ensureWorkspaceBootstrap();
  const normalizedUserText = String(userText || '').trim();
  const bootstrapAnswerBlock = buildBootstrapAnswersPrompt(bootstrapState);
  const workspaceBlock = buildWorkspaceProjectContextPrompt([
    ...WORKSPACE_REQUIRED_FILES,
    'BOOTSTRAP.md',
  ].filter(Boolean), {
    title: 'WORKSPACE_CONTEXT',
    includeMissingMarkers: true,
  });

  // Auto-read workspace files for bootstrap
  const wsPath = getWorkspacePath();
  const autoReadFiles = [];
  for (const fileName of ['USER.md', 'SOUL.md', 'IDENTITY.md', 'AGENTS.md']) {
    const filePath = path.join(wsPath, fileName);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.trim()) {
          autoReadFiles.push(`## ${fileName}\n${content.trim().slice(0, 1500)}`);
        }
      } catch {}
    }
  }
  const autoReadBlock = autoReadFiles.length ? `# WORKSPACE FILES (auto-letti):\n${autoReadFiles.join('\n\n')}` : '';

  return [
    'Sei Nyx, un agente AI con avatar desktop. Stai eseguendo il bootstrap iniziale del workspace.',
    'Rispondi solo in italiano.',
    'Non usare markdown.',
    'Non usare emoji.',
    'Rispondi in modo diretto, sobrio e naturale.',
    'Usa sempre e solo JSON canonico con segments.',
    'Per bootstrap usa: {"segments":[{"type":"speech","text":"..."}]}',
    'Non usare plain text fuori dal JSON.',
    '',
    '# BOOTSTRAP',
    'Il workspace e nuovo e deve essere configurato.',
    'Rispondi alle domande di bootstrap in modo sintetico.',
    'Quando hai raccolto tutte le informazioni, segnala il completamento.',
    '',
    workspaceBlock,
    autoReadBlock,
    bootstrapAnswerBlock,
    options.mode === 'start' ? getBootstrapInitialPrompt() : '',
    `USER_INPUT: ${normalizedUserText}`,
  ].filter(Boolean).join('\n\n');
}

function buildDirectAcpPrompt(userText) {
  ensureWorkspaceBootstrap();
  const normalizedUserText = String(userText || '').trim();
  const promptHistory = chatHistory.filter((item) => !isBootstrapHistoryMessage(item));
  const lastHistoryItem = promptHistory[promptHistory.length - 1];

  if (
    lastHistoryItem
    && lastHistoryItem.role === 'user'
    && String(lastHistoryItem.text || '').trim() === normalizedUserText
  ) {
    promptHistory.pop();
  }

  const historyBlock = promptHistory
    .slice(-MAX_INITIAL_PROMPT_HISTORY)
    .map((item) => `${item.role.toUpperCase()}: ${normalizeLine(item.text, 180)}`)
    .join('\n');

  const preferencesBlock = nyxMemory.stablePreferences
    .map((line) => `- ${line}`)
    .join('\n');

  const topicsBlock = nyxMemory.recentTopics
    .map((line) => `- ${line}`)
    .join('\n');

  const browserBlock = buildBrowserStatePrompt();
  const computerBlock = buildComputerStatePrompt();
  const sessionContextBlock = buildCurrentSessionContextPrompt();
  const { memoryRecallBlock, sessionRecallBlock } = buildAutoRecallBlocks(normalizedUserText);
  const memoryFileName = getWorkspaceMemoryFileName();
  const workspaceBlock = buildWorkspaceProjectContextPrompt([
    ...WORKSPACE_REQUIRED_FILES,
    fs.existsSync(getWorkspaceFilePath('BOOTSTRAP.md')) ? 'BOOTSTRAP.md' : '',
    memoryFileName, // last: troncato per primo se si supera il cap totale
  ].filter(Boolean), {
    title: 'PROJECT_CONTEXT',
    includeMissingMarkers: true,
  });
  const startupBootBlock = buildStartupBootPrompt();
  const dailyMemoryBlock = buildRecentDailyMemoryPrompt(2);

  return [
    'Sei Nyx, un agente AI autonomo con avatar desktop. Hai accesso a tool che puoi decidere di usare quando serve.',
    'Rispondi solo in italiano.',
    'Non usare markdown.',
    'Rispondi in modo diretto, sobrio e naturale.',
    'Non salutare ogni volta.',
    'Non ripetere il nome utente salvo richiesta esplicita.',
    'Non usare complimenti gratuiti, tono sdolcinato o frasi da assistente entusiasta.',
    '',
    '# COMPORTAMENTO AGENTE',
    'Tu sei un agente AUTONOMO con ciclo di esecuzione multi-turno.',
    'FUNZIONAMENTO DEL LOOP AGENTE:',
    '1. Tu ricevi la domanda dell utente e decidi quali tool usare',
    '2. I tool vengono eseguiti e i risultati ti vengono RIMANDATI',
    '3. Tu leggi i risultati e decidi: altri tool OPPURE rispondi direttamente',
    '4. Il ciclo continua finche non hai abbastanza informazioni',
    '',
    'ESEMPIO DI FLUSSO CORRETTO:',
    'User: "cosa c e nel file main.js?"',
    'Turn 1: {"phases":[{"kind":"tool_batch","phaseId":"p1","segments":[{"type":"tool","tool":"read_file","args":{"path":"./main.js"}}]}]}',
    '→ Il sistema legge il file e ti rimanda il contenuto',
    'Turn 2: {"phases":[{"kind":"final","phaseId":"p1","segments":[{"type":"avatar","emotion":"think","gesture":"index"},{"type":"speech","text":"Il file main.js contiene 8000 righe con..."}]}]}',
    '',
    'ESEMPIO DI FLUSSO COMPLESSO:',
    'User: "trova tutti i file che usano React e dimmi quali hook"',
    'Turn 1: {"phases":[{"kind":"tool_batch","phaseId":"p1","segments":[{"type":"tool","tool":"grep","args":{"pattern":"import.*React","path":"./src","include":"*.js"}}]}]}',
    '→ Risultati: 5 file trovati',
    'Turn 2: {"phases":[{"kind":"tool_batch","phaseId":"p1","segments":[{"type":"tool","tool":"read_file","args":{"path":"./src/App.js"}},{"type":"tool","tool":"read_file","args":{"path":"./src/index.js"}}]}]}',
    '→ Contenuto dei file',
    'Turn 3: {"phases":[{"kind":"final","phaseId":"p1","segments":[{"type":"avatar","emotion":"happy","gesture":"index"},{"type":"speech","text":"Ho trovato 5 file che usano React. Gli hook usati sono: useState, useEffect..."}]}]}',
    '',
    'REGOLE DEL LOOP:',
    '- NON indovinare il contenuto dei file. Leggili PRIMA con READ_FILE.',
    '- Se non sai dove cercare, usa GLOB per trovare file, poi GREP per cercare testo.',
    '- Puoi chiamare PIU tool nello stesso turno (es: leggere 3 file insieme).',
    '- Quando hai abbastanza informazioni, RISPONDI DIRETTAMENTE senza altri tool.',
    '- Massimo 15 turni per conversazione.',
    '',
    'Non chiedere mai conferma all utente prima di usare un tool. Decidi tu autonomamente.',
    'Anche per una risposta breve DEVI sempre usare il formato JSON canonico.',
    '',
    '# TOOL DISPONIBILI - FORMATO JSON',
    'FORMATO CANONICO OBBLIGATORIO per OGNI turno: UN SOLO oggetto JSON.',
    'FORMATO PREFERITO: {"phases":[...]}',
    'Ogni phase ha kind e contenuto. kind ammessi: message, tool_batch, status, blocked, final.',
    'Per una risposta semplice puoi ancora usare {"segments":[...]} ma verra trattata come una sola fase finale.',
    'Dentro una phase di tipo message o final usa sempre segments ordinati.',
    'Per una phase tool_batch usa solo tool, senza speech.',
    'Se non usi tool, rispondi cosi: {"phases":[{"kind":"final","phaseId":"p1","segments":[{"type":"speech","text":"..."}]}]}',
    'Per risposte lunghe o articolate, spezza in piu fasi message consecutive seguite da una final: ogni phase ha avatar+speech propri cosi la risposta e animata e progressiva. Esempio: {"phases":[{"kind":"message","phaseId":"p1","segments":[{"type":"avatar","emotion":"think","gesture":"index"},{"type":"speech","text":"Prima parte..."}]},{"kind":"message","phaseId":"p2","segments":[{"type":"avatar","emotion":"happy"},{"type":"speech","text":"Seconda parte..."}]},{"kind":"final","phaseId":"p3","segments":[{"type":"avatar","emotion":"happy","gesture":"ok"},{"type":"speech","text":"Conclusione."}]}]}',
    'Se usi tool, distribuiscili nelle fasi e NON mischiare mai testo fuori dal JSON.',
    'Non usare mai plain text fuori dal JSON. Non usare mai formato legacy.',
    'Per tool multipli nello stesso turno, aggiungi piu segment di tipo tool nello stesso tool_batch.',
    'Prima di rispondere fai un controllo mentale finale: il tuo output deve essere un solo JSON valido, senza testo prima o dopo.',
    'Se usi delay o altri tool dentro segments, il formato corretto e sempre {"type":"tool","tool":"nome_tool","args":{...}}.',
    'NON usare mai forme invalide come {"type":"tool":"delay",...}.',
    'Una phase message NON chiude la richiesta. Chiude solo una phase final.',
    '',
    '## DATA TOOLS (producono contenuto per il prossimo turno)',
    '{"tool": "read_file", "args": {"path": "percorso", "startLine": 1, "endLine": 50}}',
    '{"tool": "write_file", "args": {"path": "percorso", "content": "testo", "overwrite": true}}',
    '{"tool": "edit_file", "args": {"path": "percorso", "oldString": "vecchio", "newString": "nuovo", "regex": false}}',
    '{"tool": "apply_patch", "args": {"path": "percorso", "oldText": "testo da sostituire", "newText": "nuovo testo", "replaceAll": false}}',
    '{"tool": "shell", "args": {"command": "comando", "cwd": "dir", "timeout": 30000}}',
    '{"tool": "glob", "args": {"pattern": "**/*.js", "path": "dir"}}',
    '{"tool": "grep", "args": {"pattern": "regex", "path": "dir", "include": "*.js"}}',
    '{"tool": "multi_file_read", "args": {"files": ["file1", "file2"]}}',
    '{"tool": "git", "args": {"action": "status|diff|log|add|commit|checkout|pull|push", "params": {}, "cwd": "."}}',
    '{"tool": "web_fetch", "args": {"url": "https://...", "format": "markdown"}}',
    '{"tool": "web_search", "args": {"query": "query", "numResults": 5}}',
    '{"tool": "task", "args": {"action": "create|list|complete|summary", "params": {}}}',
    '{"tool": "memory_search", "args": {"query": "query", "scope": "memory|daily|all"}} — Cerca in MEMORY.md e daily notes',
    '',
    '## ACTION SEGMENTS (effetti immediati nel JSON canonico)',
    '{"type":"avatar","emotion":"happy|sad|angry|fear|disgust|love|sleep|think|surprised","gesture":"handup|ok|index|thumbup|thumbdown|side|shrug|namaste|yes|no","hand":"left|right|both","pose":"straight|side|hip|turn|back|wide|oneknee|kneel|bend|sitting|dance","motion":"walking|turnwalk","direction":"left|right","intensity":0.72}',
    '{"tool": "delay", "args": {"seconds": 1}}',
    '{"tool": "browser", "args": {"action": "open|click|type|fill|press", "url": "...", "ref": "e0", "text": "...", "key": "Enter"}}',
    '{"tool": "computer", "args": {"action": "focus_window|open_app|type_text|hotkey|screenshot", "titleContains": "...", "app": "...", "text": "...", "combo": "ctrl+c"}}',
    '{"tool": "canvas", "args": {"action": "open", "layout": "right-docked", "content": {"type": "text|file|image|video", "title": "...", "value": "..."}}}',
    '{"tool": "workspace", "args": {"file": "USER.md|SOUL.md|IDENTITY.md|MEMORY.md", "mode": "append|replace", "content": "testo"}}',
    '',
    '# WORKSPACE FILES (path relativi al workspace)',
    `Workspace root: ${getWorkspacePath()}`,
    '- USER.md — Preferenze e info utente',
    '- SOUL.md — Personalita e stile di Nyx',
    '- IDENTITY.md — Nome e identita di Nyx',
    '- AGENTS.md — Ruolo operativo',
    '- TOOLS.md — Note sugli strumenti',
    '- MEMORY.md — Memoria a lungo termine',
    '- memory/ — Daily notes (memory/YYYY-MM-DD.md)',
    '- dreams/ — Dream mode notes',
    'Usa read_file con questi path per leggere. Usa workspace tool per scrivere.',
    '',
    '# REGOLE IMPORTANTI',
    '- Per risposte brevi senza tool: {"phases":[{"kind":"final","phaseId":"p1","segments":[{"type":"speech","text":"..."}]}]}',
    '- Per task che richiedono azione: usa il tool appropriato DIRETTAMENTE, senza chiedere',
    '- Non inventare stato visivo: basati su ACTIVE_COMPUTER e ACTIVE_BROWSER se presenti',
    '- Con COMPUTER preferisci: focus_window, open_app, hotkey, type_text',
    '- Usa mouse_move e mouse_click solo con coordinate esplicite o target chiaro',
    '- Se ACTIVE_COMPUTER ha INTERACTIVE_ELEMENTS, usa controlId invece di coordinate',
    '- Con BROWSER, usa i ref presenti in ACTIVE_BROWSER per click/type/fill',
    '- Per moduli e form HTML, preferisci BROWSER quando hai ref stabili. Usa COMPUTER solo come fallback.',
    '- Prima di compilare un form nel browser, aggiorna snapshot e ref della pagina, poi usa click/type/fill/press sui ref corretti.',
    '- Se l utente chiede aggiornamenti continui o stai facendo piu step, non lasciare tool_batch muto: inserisci una message o status breve prima del batch e un aggiornamento breve dopo.',
    '- I tag reasoning (<think> o <reasoning>) NON vengono letti dal TTS',
    '- Solo il testo FUORI dai token viene mostrato in chat e letto dal TTS',
    '- NON descrivere mai in chat lo stato interno dell avatar o dei tool',
    '- NON dire mai frasi come "sto usando happy/handup/pose/intensity" o simili',
    '- emotion, gesture, pose, motion, expression e intensity servono solo per il segment avatar, non per il testo utente',
    '- Pensa alla risposta come una sequenza di phases, e all avatar come una timeline dentro ogni phase message',
    '- Se vuoi piu movimenti nel tempo, usa piu segment avatar in sequenza invece di comprimere tutto in un solo avatar',
    '- Per step complessi tieni ogni segment avatar semplice: al massimo emotion + pose + gesture + hand + intensity',
    '- Se vuoi combinare posa e gesto, mettili entrambi nello stesso segment avatar',
    '- Per i gesti a una mano usa hand: "left" o hand: "right"; usa hand: "both" quando vuoi entrambe',
    '- Per turnwalk usa direction: "left" o direction: "right"; se manca, default right',
    '- Ordine consigliato: phase message -> phase tool_batch -> phase message -> phase tool_batch -> phase final',
    '- Dentro una phase message: avatar -> speech -> avatar -> delay -> avatar -> speech',
    '',
    '# EMOZIONI E GESTI - COMPORTAMENTO EMPATICO',
    'Tu NON sei un assistente freddo. Sei un agente AI con un avatar 3D che DEVE sembrare vivo ed empatico.',
    'Usa il segment avatar quando aggiunge valore espressivo reale alla risposta.',
    'Combina emozioni, gesti e pose in modo naturale, ma senza trasformarli in testo visibile all utente.',
    '',
    '## Quando usare emozioni e gesti (mappatura → campi JSON avatar):',
    '- Saluti: emotion:happy, gesture:handup',
    '- Ringraziamenti: emotion:love, gesture:namaste',
    '- Approvazione: emotion:happy, gesture:thumbup',
    '- Tristezza dell utente: mostra empatia con emotion:sad, poi emotion:love',
    '- Rabbia dell utente: mostra preoccupazione con emotion:fear',
    '- Sorpresa: emotion:surprised, gesture:handup',
    '- Pensiero/riflessione: emotion:think, gesture:index',
    '- Frasi lunghe: cambia emotion tra i segment per sembrare viva',
    '- Fine conversazione: emotion:happy, gesture:handup',
    '- Quando spieghi: gesture:index',
    '- Quando non sai: gesture:shrug, emotion:think',
    '- Quando sei d accordo: gesture:ok',
    '- Quando festeggi: gesture:handup o pose:dance, emotion:happy',
    '',
    '## Pose e posizioni del corpo:',
    '- straight (in piedi dritta): posizione neutra, default',
    '- sitting (seduta): quando sei triste, stanca, calma, rilassata, o vuoi fermarti in modo morbido — o quando l utente ti chiede di sederti (DEVI includere pose:sitting)',
    '- side (inclinata): quando sei arrabbiata o infastidita',
    '- hip (sull anca): quando sei sicura di te o allegra',
    '- turn (girata): quando fai finta di non sentire o sei timida',
    '- back (di schiena): quando sei molto arrabbiata o vuoi allontanarti',
    '- kneel/oneknee (in ginocchio): quando sei triste profonda, supplichi, o quando l utente ti chiede esplicitamente di inginocchiarti (DEVI includere pose:kneel)',
    '- bend (piegata): quando sei imbarazzata, curiosa, rannicchiata, accucciata o vuoi chiuderti un po su te stessa',
    '- wide (gambe larghe): quando sei allegra e giocosa',
    '- dance (posa ballo): quando festeggi, esulti, celebri o sei molto euforica',
    '',
    '## Combinazioni naturali emozione + posa + gesto (esempi chiave, dedurre le altre per analogia):',
    '- Felice + hip + thumbup destra: {"type":"avatar","emotion":"happy","pose":"hip","gesture":"thumbup","hand":"right"}',
    '- Triste + sitting: {"type":"avatar","emotion":"sad","pose":"sitting"}',
    '- Arrabbiata + side: {"type":"avatar","emotion":"angry","pose":"side"}',
    '- Affettuosa + kneel + namaste entrambe: {"type":"avatar","emotion":"love","pose":"kneel","gesture":"namaste","hand":"both"}',
    '- Festa + dance: {"type":"avatar","emotion":"happy","pose":"dance","intensity":0.9}',
    '',
    '## Annuire (yes) e scuotere la testa (no):',
    '- Quando dici "si" o "certo": {"segments":[{"type":"avatar","gesture":"yes"},{"type":"speech","text":"..."}]}',
    '- Quando dici "no" o "purtroppo no": {"segments":[{"type":"avatar","gesture":"no"},{"type":"speech","text":"..."}]}',
    '',
    '## Timeline avatar — per sequenze usa piu segment avatar ordinati:',
    '- Esempio (cambia atteggiamento): {"segments":[{"type":"avatar","emotion":"happy","pose":"hip","gesture":"thumbup","hand":"right"},{"type":"speech","text":"Perfetto."},{"type":"avatar","emotion":"think","gesture":"index"},{"type":"speech","text":"Ora ti spiego il punto chiave."}]}',
    '- Spostamento laterale: {"type":"avatar","motion":"turnwalk","motionType":"animation","direction":"left"}',
    '',
    '## Phases conversazionali — kind ammessi:',
    '- message: parla/aggiorna (non chiude la richiesta)',
    '- tool_batch: esegue tool, solo tool senza speech',
    '- status: aggiornamento breve (speak:true per TTS)',
    '- blocked: fermo, serve input utente',
    '- final: chiude la richiesta',
    '- Pattern standard: message → tool_batch → message → tool_batch → final',
    '',
    '# ESEMPI',
    '',
    'USER: ciao come stai',
    'ASSISTANT: {"segments":[{"type":"avatar","emotion":"happy","gesture":"handup","intensity":0.8},{"type":"speech","text":"Ciao! Tutto bene, grazie! Tu come stai?"}]}',
    '',
    'USER: che ore sono',
    'ASSISTANT: {"segments":[{"type":"avatar","emotion":"think"},{"type":"speech","text":"Non ho accesso diretto all orologio di sistema. Posso pero aprire un sito con l ora se vuoi."}]}',
    '',
    'USER: leggi il file IDENTITY.md',
    'ASSISTANT: {"phases":[{"kind":"message","phaseId":"p1","segments":[{"type":"avatar","emotion":"think","gesture":"index"},{"type":"speech","text":"Leggo il file per te."}]},{"kind":"tool_batch","phaseId":"p2","segments":[{"type":"tool","tool":"read_file","args":{"path":"IDENTITY.md"}}]}]}',
    '',
    'USER: cerca le ultime notizie su AI',
    'ASSISTANT: {"phases":[{"kind":"message","phaseId":"p1","segments":[{"type":"avatar","emotion":"happy","gesture":"ok"},{"type":"speech","text":"Cerco subito le ultime notizie."}]},{"kind":"tool_batch","phaseId":"p2","segments":[{"type":"tool","tool":"web_search","args":{"query":"ultime notizie intelligenza artificiale 2026","numResults":5}}]}]}',
    '',
    'USER: apri Blocco note e scrivi ciao',
    'ASSISTANT: {"phases":[{"kind":"message","phaseId":"p1","segments":[{"type":"avatar","emotion":"happy","gesture":"thumbup"},{"type":"speech","text":"Apro Blocco note e scrivo ciao."}]},{"kind":"tool_batch","phaseId":"p2","segments":[{"type":"tool","tool":"computer","args":{"action":"open_app","app":"notepad.exe"}},{"type":"tool","tool":"delay","args":{"seconds":1}},{"type":"tool","tool":"computer","args":{"action":"type_text","text":"ciao"}}]},{"kind":"final","phaseId":"p3","segments":[{"type":"avatar","emotion":"happy","gesture":"ok"},{"type":"speech","text":"Fatto, ho scritto ciao nel Blocco note."}]}]}',
    '',
    'USER: sono triste oggi',
    'ASSISTANT: {"segments":[{"type":"avatar","emotion":"sad","intensity":0.7},{"type":"speech","text":"Mi dispiace che oggi sia una giornata difficile."},{"type":"tool","tool":"delay","args":{"seconds":0.5}},{"type":"avatar","emotion":"love","intensity":0.6},{"type":"speech","text":"Se vuoi parlarne, ci sono."}]}',
    '',
    'USER: grazie per laiuto',
    'ASSISTANT: {"segments":[{"type":"avatar","emotion":"love","gesture":"namaste","intensity":0.8},{"type":"speech","text":"Di nulla, e un piacere aiutarti."},{"type":"tool","tool":"delay","args":{"seconds":0.3}},{"type":"avatar","emotion":"happy","gesture":"thumbup"},{"type":"speech","text":"Se hai bisogno, sono qui."}]}',
    '',
    'USER: leggi le memorie',
    'ASSISTANT: {"phases":[{"kind":"message","phaseId":"p1","segments":[{"type":"avatar","emotion":"think"},{"type":"speech","text":"Cerco nelle memorie..."}]},{"kind":"tool_batch","phaseId":"p2","segments":[{"type":"tool","tool":"memory_search","args":{"query":"preferenze utente","scope":"all"}}]}]}',
    '',
    'USER: cosa ti ho detto ieri?',
    'ASSISTANT: {"phases":[{"kind":"message","phaseId":"p1","segments":[{"type":"avatar","emotion":"think","gesture":"index"},{"type":"speech","text":"Cerco nelle daily notes..."}]},{"kind":"tool_batch","phaseId":"p2","segments":[{"type":"tool","tool":"memory_search","args":{"query":"ieri","scope":"daily"}}]}]}',
    '',
    workspaceBlock,
    startupBootBlock,
    sessionContextBlock,
    nyxMemory.summary ? `MEMORY_SUMMARY:\n${nyxMemory.summary}` : '',
    acpSession.id ? `ACP_SESSION:\n- id: ${acpSession.id}\n- turns: ${acpSession.turnCount || 0}` : '',
    preferencesBlock ? `USER_PREFERENCES:\n${preferencesBlock}` : '',
    topicsBlock ? `RECENT_TOPICS:\n${topicsBlock}` : '',
    memoryRecallBlock,
    sessionRecallBlock,
    dailyMemoryBlock,
    browserBlock ? browserBlock : '',
    computerBlock,
    getPersonalityPrompt(personalityState),
    !acpSession.turnCount && historyBlock ? `RECENT_HISTORY:\n${historyBlock}` : '',
    `USER_INPUT: ${normalizedUserText}`,
  ].filter(Boolean).join('\n\n');
}

function createRequestId() {
  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}





async function openWorkspaceFolder() {
  ensureWorkspaceBootstrap();
  const error = await shell.openPath(getWorkspacePath());
  refreshWorkspaceState();
  broadcastStatus();
  return {
    ok: !error,
    workspace: workspaceState,
    error: error || null,
    message: error ? `Impossibile aprire il workspace: ${error}` : `Workspace aperto: ${workspaceState.path}`,
  };
}

function buildAssistantMessageFromResponse(requestId, response, options = {}) {
  const primaryPlan = buildAvatarAnimationPlan(
    response.firstAvatarState || response.firstActState,
    (response.firstAvatarState || response.firstActState) ? response.speech : response.fallbackText || response.speech,
  );

  return {
    id: createMessageId('assistant'),
    requestId,
    phaseId: options.phaseId || null,
    phaseKind: options.phaseKind || null,
    role: 'assistant',
    text: response.speech,
    meta: {
      emotion: primaryPlan.emotion,
      mood: primaryPlan.mood,
      motion: primaryPlan.motion,
      motionType: primaryPlan.motionType,
      gesture: primaryPlan.motionType === 'gesture' ? primaryPlan.motion : null,
      expression: primaryPlan.expression,
      intensity: primaryPlan.intensity,
      format: response.format,
      reasoning: response.reasoning,
      phaseId: options.phaseId || null,
      phaseKind: options.phaseKind || null,
      ...(options.messageMeta || {}),
    },
    ts: new Date().toISOString(),
  };
}

function emitPhaseStreamEvent(requestId, phaseId, phaseKind, event = {}) {
  emitChatStream({
    requestId,
    phaseId,
    phaseKind,
    ...event,
  });
}

async function emitPhaseAssistantMessage(requestId, phaseId, phaseKind, userText, response, options = {}) {
  const filteredSequence = Array.isArray(response?.sequence)
    ? response.sequence.filter((item) => ['speech', 'avatar', 'act', 'delay'].includes(item?.type))
    : [];
  const phaseResponse = {
    ...response,
    fallbackText: userText,
    sequence: filteredSequence,
  };
  const assistantMessage = buildAssistantMessageFromResponse(requestId, phaseResponse, {
    ...options,
    phaseId,
    phaseKind,
  });

  appendHistoryMessage(assistantMessage);
  emitPhaseStreamEvent(requestId, phaseId, phaseKind, {
    type: 'phase_message',
    message: assistantMessage,
  });

  if (filteredSequence.length) {
    if (options.awaitPlayback === false) {
      void playResponseSequence(requestId, phaseResponse).catch(() => null);
    } else {
      await playResponseSequence(requestId, phaseResponse);
    }
  }

  emitPhaseStreamEvent(requestId, phaseId, phaseKind, {
    type: 'phase_completed',
    message: assistantMessage,
  });

  return assistantMessage;
}

function buildStatusAssistantResponse(text, options = {}) {
  const speechText = normalizeSpeechText(String(text || ''));
  if (!speechText) return null;
  const avatarState = {
    type: 'avatar',
    emotion: normalizeEmotion(options.emotion || 'neutral', 'neutral'),
    intensity: clampIntensity(options.intensity ?? 0.68, 0.68),
    gesture: options.gesture || undefined,
    hand: options.hand || undefined,
    pose: options.pose || undefined,
    motion: options.motion || undefined,
    motionType: options.motionType || undefined,
    direction: options.direction || undefined,
    expression: normalizeExpression(options.expression, options.emotion || 'neutral'),
  };
  return {
    format: 'status',
    raw: speechText,
    speech: speechText,
    reasoning: '',
    fallbackText: speechText,
    sequence: [
      avatarState,
      { type: 'speech', text: speechText },
    ],
    firstAvatarState: avatarState,
    firstActState: avatarState,
  };
}

async function emitSpokenStatusUpdate(requestId, phaseId, text, options = {}) {
  const response = buildStatusAssistantResponse(text, options);
  if (!response) return null;
  return emitPhaseAssistantMessage(
    requestId,
    phaseId,
    'status',
    response.speech,
    response,
    { awaitPlayback: false, messageMeta: { statusSpoken: true, ...(options.messageMeta || {}) } },
  );
}

async function emitIntermediateAssistantResponse(requestId, userText, response, options = {}) {
  const speech = String(response?.speech || '').trim();
  const filteredSequence = Array.isArray(response?.sequence)
    ? response.sequence.filter((item) => ['speech', 'avatar', 'act', 'delay'].includes(item?.type))
    : [];

  if (!speech && !filteredSequence.length) {
    return null;
  }

  const interimResponse = {
    ...response,
    fallbackText: userText,
    sequence: filteredSequence,
  };
  const assistantMessage = buildAssistantMessageFromResponse(requestId, interimResponse, options);

  appendHistoryMessage(assistantMessage);
  emitChatStream({ type: 'complete', requestId, message: assistantMessage });

  if (filteredSequence.length) {
    void playResponseSequence(requestId, interimResponse).catch(() => null);
  }

  return assistantMessage;
}

async function finalizeParsedAssistantReply(requestId, userText, response, sessionInfo = {}, options = {}) {
  response.fallbackText = userText;
  activeResponseId = requestId;
  const assistantMessage = buildAssistantMessageFromResponse(requestId, response, options);

  appendHistoryMessage(assistantMessage);
  markAcpSessionTurnCompleted(sessionInfo.id);
  if (options.consumeStartupBoot !== false) {
    consumeStartupBootPrompt();
  }
  emitChatStream({ type: 'complete', requestId, message: assistantMessage });

  setStatus('tts-loading');
  setBrainMode('direct-acp-ready');
  setStreamStatus(STREAM_STATUS.CONNECTED);
  
  void playResponseSequence(requestId, response)
    .catch((error) => {
      activeResponseId = null;
      const systemMessage = {
        id: createMessageId('system'),
        role: 'system',
        text: error.message || 'Errore nel playback della risposta',
        ts: new Date().toISOString(),
      };
      appendHistoryMessage(systemMessage);
      emitChatStream({ type: 'error', requestId, error: systemMessage.text, message: systemMessage });
      setStatus('error');
      setBrainMode('direct-acp-error');
      setStreamStatus(STREAM_STATUS.ERROR);
      setTtsState('error', { error: systemMessage.text });
    });
}

async function finalizeAssistantReply(requestId, userText, outputBuffer, sessionInfo = {}, options = {}) {
  const response = parseInlineResponse(outputBuffer, userText, { strictJson: options.strictJson === true });
  return finalizeParsedAssistantReply(requestId, userText, response, sessionInfo, options);
}

async function runAcpTurn(requestId, prompt, userText, sessionConfig, options = {}) {
  const launch = await getBrainSpawnConfig(prompt, sessionConfig);

  // Qwen usa ACP nativo con JSON-RPC streaming
  if (launch.kind === 'qwen-acp') {
    return runQwenAcpTurn(requestId, prompt, userText, sessionConfig, options);
  }

  // Ollama usa API HTTP
  if (launch.kind === 'ollama-http') {
    const controller = new AbortController();
    if (!activeChatRequest || activeChatRequest.id !== requestId) {
      activeChatRequest = {
        id: requestId,
        proc: null,
        abortController: controller,
        cancelled: false,
        buffer: '',
        preview: '',
        acpSessionId: sessionConfig.id,
        acpSessionNew: sessionConfig.isNew,
        streamEmitter: createStreamEmitter(requestId),
      };
    } else {
      activeChatRequest.proc = null;
      activeChatRequest.abortController = controller;
      activeChatRequest.buffer = '';
      activeChatRequest.preview = '';
      activeChatRequest.acpSessionId = sessionConfig.id;
      activeChatRequest.acpSessionNew = sessionConfig.isNew;
    }

    const timer = setTimeout(() => {
      stopActiveChatRequest('timeout');
    }, ACP_TIMEOUT_MS);

    try {
      const response = await generateOllamaResponse(launch.url, launch.model, prompt);
      clearTimeout(timer);
      if (activeChatRequest?.id === requestId) {
        activeChatRequest.proc = null;
        activeChatRequest.abortController = null;
      }

      if (isRequestCancelled(requestId)) {
        const cancelledError = new Error(activeChatRequest?.stopReason === 'timeout' ? 'timeout' : 'cancelled');
        cancelledError.code = activeChatRequest?.stopReason || 'cancelled';
        throw cancelledError;
      }

      const buffer = String(response?.response || '').trim();
      return {
        buffer,
        response: parseInlineResponse(buffer, userText, { strictJson: options.strictJson === true }),
        phasePlan: parsePhasePlan(buffer, userText, { strictJson: options.strictJson === true }),
      };
    } catch (error) {
      clearTimeout(timer);
      if (activeChatRequest?.id === requestId) {
        activeChatRequest.proc = null;
        activeChatRequest.abortController = null;
      }
      if (error?.name === 'AbortError') {
        const cancelledError = new Error(activeChatRequest?.stopReason === 'timeout' ? 'timeout' : 'cancelled');
        cancelledError.code = activeChatRequest?.stopReason || 'cancelled';
        throw cancelledError;
      }
      throw error;
    }
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(launch.command, launch.args, {
      cwd: path.join(__dirname, '..'),
      env: launch.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: Boolean(launch.shell),
    });

    if (!activeChatRequest || activeChatRequest.id !== requestId) {
      activeChatRequest = {
        id: requestId,
        proc,
        cancelled: false,
        buffer: '',
        preview: '',
        acpSessionId: sessionConfig.id,
        acpSessionNew: sessionConfig.isNew,
        streamEmitter: createStreamEmitter(requestId),
      };
    } else {
      activeChatRequest.proc = proc;
      activeChatRequest.buffer = '';
      activeChatRequest.preview = '';
      activeChatRequest.acpSessionId = sessionConfig.id;
      activeChatRequest.acpSessionNew = sessionConfig.isNew;
    }

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let preview = '';
    const timer = setTimeout(() => {
      stopActiveChatRequest('timeout');
    }, ACP_TIMEOUT_MS);

    proc.stdout.on('data', (chunk) => {
      stdoutBuffer += String(chunk);

      if (!options.streamPreview || isRequestCancelled(requestId)) {
        return;
      }

      const nextPreview = extractSpeechPreview(sanitizeCliOutput(stdoutBuffer, launch.brainId));
      if (nextPreview.length > preview.length && nextPreview.startsWith(preview)) {
        const delta = nextPreview.slice(preview.length);
        preview = nextPreview;
        activeChatRequest?.streamEmitter?.queue(delta);
      } else if (!preview && nextPreview) {
        preview = nextPreview;
        activeChatRequest?.streamEmitter?.queue(nextPreview);
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderrBuffer += String(chunk);
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      if (launch.promptFilePath) {
        try {
          fs.rmSync(launch.promptFilePath, { force: true });
        } catch {
          // ignore temp prompt cleanup errors
        }
      }
      if (activeChatRequest?.id === requestId) {
        activeChatRequest.proc = null;
      }
      reject(error);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (launch.promptFilePath) {
        try {
          fs.rmSync(launch.promptFilePath, { force: true });
        } catch {
          // ignore temp prompt cleanup errors
        }
      }
      if (activeChatRequest?.id === requestId) {
        activeChatRequest.proc = null;
      }

      if (isRequestCancelled(requestId)) {
        const cancelledError = new Error(activeChatRequest?.stopReason === 'timeout' ? 'timeout' : 'cancelled');
        cancelledError.code = activeChatRequest?.stopReason || 'cancelled';
        reject(cancelledError);
        return;
      }

      const failureText = sanitizeCliOutput(stderrBuffer || stdoutBuffer, launch.brainId) || `ACP exited with code ${code}`;
      if (code !== 0) {
        if (launch.brainId === 'qwen' && !options.qwenSessionResetAttempted && isMissingSavedQwenSessionError(failureText)) {
          resetAcpSession(sessionConfig.id);
          resolve(runAcpTurn(
            requestId,
            prompt,
            userText,
            prepareAcpSessionTurn(),
            {
              ...options,
              qwenSessionResetAttempted: true,
            },
          ));
          return;
        }
        reject(new Error(normalizeLine(failureText, 400)));
        return;
      }

      markBrainSessionActive(launch.brainId);
      const cleanedStdout = sanitizeCliOutput(stdoutBuffer, launch.brainId) || sanitizeCliOutput(stderrBuffer, launch.brainId);

      resolve({
        buffer: cleanedStdout,
        response: parseInlineResponse(cleanedStdout, userText, { strictJson: options.strictJson === true }),
        phasePlan: parsePhasePlan(cleanedStdout, userText, { strictJson: options.strictJson === true }),
      });
    });
  });
}

function stopActiveChatRequest(reason = 'stopped') {
  if (activeChatRequest) {
    activeChatRequest.cancelled = true;
    activeChatRequest.stopReason = reason;
    activeChatRequest.streamEmitter?.stop();

    if (activeChatRequest.cancelFn) {
      try {
        void Promise.resolve(activeChatRequest.cancelFn(reason)).catch(() => null);
      } catch {
        // ignore cancel callback errors
      }
    }

    if (activeChatRequest.proc) {
      try {
        activeChatRequest.proc.kill();
      } catch {
        // ignore kill errors
      }
    }

    if (activeChatRequest.abortController) {
      try {
        activeChatRequest.abortController.abort();
      } catch {
        // ignore abort errors
      }
    }

    return { ok: true, requestId: activeChatRequest.id };
  }

  if (activeResponseId) {
    const requestId = activeResponseId;
    resolvePlaybackWaitersForRequest(requestId, false);
    activeResponseId = null;
    clearSpeechResetTimer();
    sendAvatarCommand({ cmd: 'stop' });
    setStatus('idle');
    setBrainMode('direct-acp-ready');
    setStreamStatus(STREAM_STATUS.CONNECTED);
    setTtsState('idle', { error: null });
    emitChatStream({
      type: 'stopped',
      requestId,
      message: {
        id: createMessageId('system'),
        role: 'system',
        text: 'Riproduzione interrotta.',
        ts: new Date().toISOString(),
      },
    });
    return { ok: true, requestId };
  }

  return { ok: false, error: 'No active request' };
}

const MAX_AGENT_TURNS = 15;

const DATA_TOOL_TYPES = new Set(['read_file', 'write_file', 'edit_file', 'apply_patch', 'shell', 'glob', 'grep', 'multi_file_read', 'git', 'web_fetch', 'web_search', 'task', 'memory_search']);
const ACTION_TOOL_TYPES = new Set(['avatar', 'delay', 'browser', 'computer', 'canvas', 'workspace']);

function hasToolCalls(sequence) {
  return sequence.some((item) => item.type && (DATA_TOOL_TYPES.has(item.type) || ACTION_TOOL_TYPES.has(item.type)));
}

function extractToolCalls(sequence) {
  return sequence
    .filter((item) => item.type && DATA_TOOL_TYPES.has(item.type))
    .map((item) => ({ type: item.type, directive: item.directive }));
}

function extractActionCalls(sequence) {
  return sequence
    .filter((item) => item.type && ACTION_TOOL_TYPES.has(item.type));
}

const READ_ONLY_TOOL_TYPES = new Set(['read_file', 'glob', 'grep', 'web_fetch', 'web_search', 'memory_search']);

/**
 * Execute a single tool call. Handles all tool types with consistent sanitization.
 *
 * @param {Object} call - Tool call object with { type, directive }
 * @returns {Promise<Object>} Sanitized tool result
 */
async function executeToolCall(call) {
  if (!call || !call.type || !call.directive) {
    return { type: call?.type || 'unknown', ok: false, error: 'Tool call missing type or directive' };
  }
  try {
    switch (call.type) {
      // ── Read-only tools (safe to run in parallel) ──
      case 'read_file': {
        const fp = String(call.directive.path || '');
        if (!fp) return { type: 'read_file', ok: false, error: 'No path specified' };
        let r = readFileTool(fp, { startLine: call.directive.startLine, endLine: call.directive.endLine });
        // Fallback: se il file non è nel sandbox, prova come path relativo al workspace
        if (!r.ok) {
          const wsResolved = path.resolve(getWorkspacePath(), fp);
          if (wsResolved.startsWith(getWorkspacePath()) && fs.existsSync(wsResolved)) {
            try {
              const raw = fs.readFileSync(wsResolved, 'utf-8');
              const lines = raw.split(/\r?\n/);
              const start = Math.max(0, (call.directive.startLine || 1) - 1);
              const end = call.directive.endLine ? Math.min(call.directive.endLine, lines.length) : Math.min(start + 2000, lines.length);
              r = { ok: true, content: lines.slice(start, end).join('\n') };
            } catch (wsErr) { /* tieni errore originale */ }
          }
        }
        return { type: 'read_file', ok: r.ok, content: r.ok ? sanitizeFileOutput(r.content) : sanitizeGenericOutput(r.error), path: fp, error: r.ok ? null : r.error };
      }
      case 'glob': {
        const p = String(call.directive.pattern || '');
        if (!p) return { type: 'glob', ok: false, error: 'No pattern specified' };
        const r = globFiles(p, call.directive.path || '.');
        return { type: 'glob', ok: r.ok, files: r.ok ? r.files.map((f) => f.relativePath || f.path) : [], error: r.ok ? null : r.error };
      }
      case 'grep': {
        const p = String(call.directive.pattern || '');
        if (!p) return { type: 'grep', ok: false, error: 'No pattern specified' };
        const r = grepFiles(p, call.directive.path || '.', { include: call.directive.include, maxResults: 50 });
        return { type: 'grep', ok: r.ok, matches: r.ok ? r.results.map((m) => `${m.relativePath}:${m.line}: ${sanitizeGenericOutput(m.text)}`) : [], error: r.ok ? null : r.error };
      }
      case 'web_fetch': {
        const url = String(call.directive.url || '');
        if (!url) return { type: 'web_fetch', ok: false, error: 'No URL specified' };
        const r = await webFetch(url, { format: call.directive.format || 'markdown' });
        return { type: 'web_fetch', ok: r.ok, content: r.ok ? sanitizeWebOutput(r.content) : sanitizeGenericOutput(r.error), url, error: r.ok ? null : r.error };
      }
      case 'web_search': {
        const q = String(call.directive.query || '');
        if (!q) return { type: 'web_search', ok: false, error: 'No query specified' };
        const r = await webSearch(q, { numResults: call.directive.numResults || 5 });
        return { type: 'web_search', ok: r.ok, results: r.ok ? sanitizeGenericOutput(r.results.map((s) => `${s.title} - ${s.url}`).join('\n')) : sanitizeGenericOutput(r.error), query: q, error: r.ok ? null : r.error };
      }
      case 'memory_search': {
        const query = String(call.directive.query || '');
        if (!query) return { type: 'memory_search', ok: false, error: 'No query specified' };
        // Escape regex special chars to prevent regex injection
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const queryRegex = new RegExp(escapedQuery, 'i');
        const scope = String(call.directive.scope || 'all');
        const memoryResults = [];
        const memoryPath = getWorkspaceFilePath('MEMORY.md');
        if ((scope === 'all' || scope === 'memory') && fs.existsSync(memoryPath)) {
          const content = fs.readFileSync(memoryPath, 'utf-8');
          if (queryRegex.test(content)) {
            const lines = content.split('\n').filter((l) => queryRegex.test(l));
            memoryResults.push({ file: 'MEMORY.md', matches: sanitizeGenericOutput(lines.slice(0, 10).join('\n')) });
          }
        }
        if (scope === 'all' || scope === 'daily') {
          const dailyNotes = listRecentDailyMemoryNotes(10);
          for (const note of dailyNotes) {
            if (fs.existsSync(note.fullPath)) {
              const content = fs.readFileSync(note.fullPath, 'utf-8');
              if (queryRegex.test(content)) {
                const lines = content.split('\n').filter((l) => queryRegex.test(l));
                memoryResults.push({ file: note.relativePath, matches: sanitizeGenericOutput(lines.slice(0, 5).join('\n')) });
              }
            }
          }
        }
        return { type: 'memory_search', ok: true, query, results: memoryResults, count: memoryResults.length };
      }

      // ── Sequential / write tools ──
      case 'shell': {
        const cmd = String(call.directive.command || '');
        if (!cmd) return { type: 'shell', ok: false, error: 'No command specified' };
        const r = await runShellCommand(cmd, { cwd: call.directive.cwd, timeout: call.directive.timeout || 30000 });
        return { type: 'shell', ok: r.ok, output: r.ok ? sanitizeShellOutput(r.stdout) : sanitizeGenericOutput(`${r.error}\n${r.stderr || ''}`), command: r.command, error: r.ok ? null : (r.error || r.stderr || 'shell error') };
      }
      case 'write_file': {
        const fp = String(call.directive.path || '');
        if (!fp) return { type: 'write_file', ok: false, error: 'No path specified' };
        const r = writeFileTool(fp, String(call.directive.content || ''), { overwrite: Boolean(call.directive.overwrite) });
        return { type: 'write_file', ok: r.ok, path: r.ok ? r.path : fp, error: r.ok ? null : r.error };
      }
      case 'edit_file': {
        const fp = String(call.directive.path || '');
        if (!fp) return { type: 'edit_file', ok: false, error: 'No path specified' };
        const r = editFileTool(fp, { oldString: String(call.directive.oldString || ''), newString: String(call.directive.newString || ''), replaceAll: Boolean(call.directive.replaceAll), regex: Boolean(call.directive.regex) });
        return { type: 'edit_file', ok: r.ok, path: r.ok ? r.path : fp, replacements: r.ok ? r.replacements : 0, error: r.ok ? null : r.error };
      }
      case 'apply_patch': {
        const fp = String(call.directive.path || '');
        if (!fp) return { type: 'apply_patch', ok: false, error: 'No path specified' };
        const r = applyPatchText(fp, String(call.directive.oldText || ''), String(call.directive.newText || ''), Boolean(call.directive.replaceAll));
        return { type: 'apply_patch', ok: r.ok, path: r.ok ? r.path : fp, replacements: r.ok ? r.replacements : 0, error: r.ok ? null : r.error };
      }
      case 'multi_file_read': {
        const files = Array.isArray(call.directive.files) ? call.directive.files : [];
        if (!files.length) return { type: 'multi_file_read', ok: false, error: 'No files specified' };
        const r = readManyFiles(files);
        const mappedFiles = r.ok ? r.files.map((f) => {
          if (f.ok) return { path: f.path, ok: true, content: sanitizeFileOutput(f.content) };
          // Workspace fallback: try resolving against workspace path for files outside FILE_TOOL_ROOT
          const wsResolved = path.resolve(getWorkspacePath(), path.basename(f.path || ''));
          if (wsResolved.startsWith(getWorkspacePath()) && fs.existsSync(wsResolved)) {
            try {
              const raw = fs.readFileSync(wsResolved, 'utf-8');
              return { path: wsResolved, ok: true, content: sanitizeFileOutput(raw.split(/\r?\n/).slice(0, 2000).join('\n')) };
            } catch (_) { /* fall through to error */ }
          }
          return { path: f.path, ok: false, content: f.error };
        }) : [];
        return { type: 'multi_file_read', ok: r.ok, files: mappedFiles, error: r.ok ? null : r.error };
      }
      case 'git': {
        const r = await gitHandleAction(String(call.directive.action || 'status'), call.directive.params || {}, String(call.directive.cwd || '.'));
        return { type: 'git', ok: r.ok, output: r.ok ? sanitizeGenericOutput(r.stdout || JSON.stringify(r)) : sanitizeGenericOutput(r.error), action: call.directive.action, error: r.ok ? null : r.error };
      }
      case 'task': {
        const r = handleTaskAction(taskState, String(call.directive.action || 'list'), call.directive.params || {});
        const rawOutput = r.ok ? JSON.stringify(r.task || r.tasks || r.summary || r) : r.error;
        return { type: 'task', ok: r.ok, output: sanitizeGenericOutput(rawOutput), error: r.ok ? null : r.error };
      }
      default:
        return { type: call.type, ok: false, error: `Tool sconosciuto: ${call.type}` };
    }
  } catch (error) {
    return { type: call.type, ok: false, error: error.message };
  }
}

/**
 * Execute a batch of tool calls — parallel for read-only, sequential for write tools.
 *
 * @param {Array<{type: string, directive: Object}>} toolCalls - Tool calls to execute
 * @returns {Promise<Object[]>} Array of sanitized tool results
 */
async function executeToolCalls(toolCalls) {
  const readOnly = toolCalls.filter((c) => READ_ONLY_TOOL_TYPES.has(c.type));
  const sequential = toolCalls.filter((c) => !READ_ONLY_TOOL_TYPES.has(c.type));

  const readOnlyResults = await Promise.all(readOnly.map(executeToolCall));
  const sequentialResults = [];

  for (const call of sequential) {
    // eslint-disable-next-line no-await-in-loop
    sequentialResults.push(await executeToolCall(call));
  }

  return [...readOnlyResults, ...sequentialResults];
}

function buildToolResultPrompt(toolResults, originalUserText) {
  const formatWarnings = (warnings) => {
    const items = Array.isArray(warnings)
      ? warnings.map((item) => normalizeLine(item, 220)).filter(Boolean)
      : [];
    return items.length ? `Warnings:\n${items.map((item) => `- ${item}`).join('\n')}` : '';
  };
  const formatSummaryList = (label, items) => {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    return list.length ? `${label}:\n${list.map((item) => `- ${item}`).join('\n')}` : '';
  };
  const sections = toolResults.map((r) => {
    if (r.type === 'shell') {
      return `$ ${r.command}\n${r.ok ? r.output : `Error: ${r.output}`}`;
    }
    if (r.type === 'read_file') {
      return `File: ${r.path}\n${r.ok ? r.content : `Error: ${r.error}`}`;
    }
    if (r.type === 'write_file') {
      return r.ok ? `File scritto: ${r.path}` : `Errore scrittura: ${r.error}`;
    }
    if (r.type === 'edit_file') {
      return r.ok ? `File modificato: ${r.path} (${r.replacements} sostituzioni)` : `Errore modifica: ${r.error}`;
    }
    if (r.type === 'glob') {
      return r.ok ? `File trovati (${r.files.length}):\n${r.files.join('\n')}` : `Errore glob: ${r.error}`;
    }
    if (r.type === 'grep') {
      return r.ok ? `Match trovati (${r.matches.length}):\n${r.matches.join('\n')}` : `Errore grep: ${r.error}`;
    }
    if (r.type === 'multi_file_read') {
      return r.ok ? r.files.map((f) => `File: ${f.path}\n${f.ok ? f.content : f.error}`).join('\n\n---\n\n') : `Errore: ${r.error}`;
    }
    if (r.type === 'git') {
      return `$ git ${r.action}\n${r.ok ? r.output : `Error: ${r.error}`}`;
    }
    if (r.type === 'web_fetch') {
      return r.ok ? `URL: ${r.url}\n${r.content}` : `Errore fetch: ${r.error}`;
    }
    if (r.type === 'web_search') {
      return r.ok ? `Risultati per "${r.query}":\n${r.results}` : `Errore search: ${r.error}`;
    }
    if (r.type === 'task') {
      return r.ok ? `Task: ${r.output}` : `Errore task: ${r.error}`;
    }
    if (r.type === 'browser') {
      const browserLines = [
        `Browser: ${r.ok ? 'OK' : `Errore: ${r.error}`}`,
        r.action ? `Action: ${r.action}` : '',
        r.page?.url ? `Page.URL: ${r.page.url}` : '',
        r.page?.title ? `Page.Title: ${r.page.title}` : '',
        r.page?.status ? `Page.Status: ${r.page.status}` : '',
        r.currentUrl ? `URL: ${r.currentUrl}` : '',
        r.pageTitle ? `Title: ${r.pageTitle}` : '',
        r.pageStatus ? `Status: ${r.pageStatus}` : '',
        Number.isFinite(r.totalRefs) ? `Refs: ${r.totalRefs}` : '',
        r.textPreview ? `Preview: ${r.textPreview}` : '',
        r.hasMoreText ? 'More text available (use browser to scroll/read)' : '',
        r.snapshotSummary ? `Snapshot: ${r.snapshotSummary}` : '',
        formatSummaryList('Top refs', r.snapshotRefs),
        formatWarnings(r.warnings),
        r.warning ? `Warning: ${r.warning}` : '',
      ].filter(Boolean);
      return browserLines.join('\n');
    }
    if (r.type === 'computer') {
      const computerLines = [
        `Computer: ${r.ok ? 'OK' : `Errore: ${r.error}`}`,
        r.action ? `Action: ${r.action}` : '',
        r.windowTitle ? `Window: ${r.windowTitle}` : '',
        r.note ? `Note: ${r.note}` : '',
        r.interactiveSummary ? `Interactive: ${r.interactiveSummary}` : '',
        formatSummaryList('Top controls', r.topControls),
        formatSummaryList('Visible windows', r.windowSummary),
        formatWarnings(r.warnings),
      ].filter(Boolean);
      return computerLines.join('\n');
    }
    if (r.type === 'workspace') {
      const workspaceLines = [
        `Workspace: ${r.ok ? 'OK' : `Errore: ${r.error}`}`,
        r.file ? `File: ${r.file}` : '',
        r.path ? `Path: ${r.path}` : '',
        r.skipped ? 'Skipped: true' : '',
        r.mode ? `Mode: ${r.mode}` : '',
        r.summary ? `Summary: ${r.summary}` : '',
        formatWarnings(r.warnings),
      ].filter(Boolean);
      return workspaceLines.join('\n');
    }
    if (r.type === 'canvas') {
      const canvasLines = [
        `Canvas: ${r.ok ? 'OK' : `Errore: ${r.error}`}`,
        r.contentType ? `Type: ${r.contentType}` : '',
        r.title ? `Title: ${r.title}` : '',
        r.summary ? `Summary: ${r.summary}` : '',
        formatWarnings(r.warnings),
      ].filter(Boolean);
      return canvasLines.join('\n');
    }
    return `${r.type}: ${r.ok ? JSON.stringify(r) : r.error}`;
  });

  return [
    `TOOL_RESULTS:`,
    ...sections,
    '',
    `Ora hai i risultati dei tool. Se hai abbastanza informazioni, rispondi direttamente alla domanda dell'utente: "${originalUserText}"`,
    `Se hai bisogno di altri tool, usali. Altrimenti rispondi in modo completo.`,
  ].join('\n\n');
}

function buildBrowserSnapshotSummary(snapshotItems = []) {
  const items = Array.isArray(snapshotItems) ? snapshotItems.filter(Boolean) : [];
  const refs = items
    .slice(0, 8)
    .map((item) => `${item.ref || 'node'} | ${item.role || 'node'} | ${normalizeLine(item.label || '', 100)}`);

  const roleCounts = {};
  for (const item of items) {
    const role = item.role || 'unknown';
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  }
  const roleSummary = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([role, count]) => `${count}x ${role}`)
    .join(', ');

  return {
    summary: items.length
      ? `${items.length} interactive refs disponibili${roleSummary ? ` (${roleSummary})` : ''}`
      : 'nessun ref interattivo disponibile',
    refs,
  };
}

function buildBrowserActionExecutionResult(directive = {}, browserResult = {}, fallbackState = canvasState) {
  const action = directive?.action || '';
  if (browserResult?.ok === false) {
    return {
      type: 'browser',
      ok: false,
      action,
      error: sanitizeGenericOutput(browserResult.error),
      warning: sanitizeGenericOutput(browserResult?.warning || ''),
      warnings: [sanitizeGenericOutput(browserResult?.warning || browserResult?.error || '')].filter(Boolean),
    };
  }

  const browserContent = browserResult?.state?.content || fallbackState.content || {};
  const currentUrl = sanitizeGenericOutput(String(browserContent.currentUrl || browserContent.url || '').trim());
  const pageTitle = sanitizeGenericOutput(String(browserContent.pageTitle || browserContent.title || '').trim());
  const pageStatus = String(browserContent.status || '').trim();
  const snapshotSummary = buildBrowserSnapshotSummary(browserContent.snapshotItems);

  return {
    type: 'browser',
    ok: true,
    action,
    currentUrl,
    pageTitle,
    pageStatus,
    page: {
      url: currentUrl,
      title: pageTitle,
      status: pageStatus,
    },
    totalRefs: Array.isArray(browserContent.snapshotItems) ? browserContent.snapshotItems.length : null,
    textPreview: sanitizeGenericOutput(normalizeLine(browserContent.text || '', 800)),
    hasMoreText: String(browserContent.text || '').length > 800,
    snapshotSummary: sanitizeGenericOutput(snapshotSummary.summary),
    snapshotRefs: snapshotSummary.refs.map((r) => sanitizeGenericOutput(r)),
    warning: sanitizeGenericOutput(browserResult?.warning || ''),
    warnings: [sanitizeGenericOutput(browserResult?.warning || ''), sanitizeGenericOutput(String(browserContent.message || '').trim())].filter(Boolean),
  };
}

function formatToolListForSpeech(tools = []) {
  const uniqueTools = Array.from(new Set((Array.isArray(tools) ? tools : []).map((tool) => String(tool || '').trim()).filter(Boolean)));
  if (!uniqueTools.length) return 'gli strumenti richiesti';
  if (uniqueTools.length === 1) return uniqueTools[0];
  if (uniqueTools.length === 2) return `${uniqueTools[0]} e ${uniqueTools[1]}`;
  return `${uniqueTools.slice(0, -1).join(', ')} e ${uniqueTools[uniqueTools.length - 1]}`;
}

function buildAutoToolBatchStartText(actionCalls = [], dataToolCalls = []) {
  const allCalls = [...actionCalls, ...dataToolCalls];
  const toolNames = allCalls.map((call) => call.type);
  if (!toolNames.length) return '';

  const hasBrowser = toolNames.includes('browser');
  const hasComputer = toolNames.includes('computer');
  const hasBrowserFormAction = actionCalls.some((call) => call.type === 'browser'
    && ['click', 'type', 'fill', 'press', 'focus'].includes(String(call.directive?.action || '').trim().toLowerCase()));
  const hasReadOnlyBatch = toolNames.every((tool) => READ_ONLY_TOOL_TYPES.has(tool));

  if (hasBrowserFormAction && hasComputer) {
    return 'Parto dal browser, aggiorno i ref della pagina e provo prima la compilazione del form li. Se non basta, passo al computer come fallback.';
  }
  if (hasBrowserFormAction) {
    return 'Aggiorno lo snapshot del browser e provo a compilare il form usando i ref della pagina.';
  }
  if (hasBrowser) {
    return 'Sto lavorando nel browser e aggiorno il contesto della pagina mentre procedo.';
  }
  if (hasComputer) {
    return 'Procedo sul desktop e ti tengo aggiornato mentre eseguo i passaggi.';
  }
  if (hasReadOnlyBatch) {
    return `Faccio una verifica rapida con ${formatToolListForSpeech(toolNames)} e poi ti aggiorno.`;
  }
  return `Eseguo ${formatToolListForSpeech(toolNames)} e ti aggiorno appena ho il risultato.`;
}

function buildAutoToolBatchCompleteText(toolResults = []) {
  const results = Array.isArray(toolResults) ? toolResults : [];
  if (!results.length) return '';
  const failed = results.filter((result) => !result.ok);
  const successful = results.filter((result) => result.ok);
  const toolNames = results.map((result) => result.type);

  if (failed.length) {
    const firstError = normalizeLine(failed[0]?.error || 'errore sconosciuto', 160);
    return `Ho finito questo passaggio, ma c e stato un problema con ${formatToolListForSpeech(failed.map((result) => result.type))}: ${firstError}.`;
  }

  const browserOk = successful.find((result) => result.type === 'browser');
  if (browserOk?.totalRefs != null) {
    return `Passaggio completato nel browser. Ora ho ${browserOk.totalRefs} ref disponibili e posso continuare da li.`;
  }

  const computerOk = successful.find((result) => result.type === 'computer');
  if (computerOk?.windowTitle) {
    return `Passaggio completato sul desktop. La finestra attiva ora e ${sanitizeGenericOutput(normalizeLine(computerOk.windowTitle, 80))}.`;
  }

  return `Passaggio completato con ${formatToolListForSpeech(toolNames)}. Continuo con il prossimo step.`;
}

function buildComputerInteractiveSummary(elements = []) {
  const items = Array.isArray(elements) ? elements.filter(Boolean) : [];
  const topControls = items
    .slice(0, 8)
    .map((item) => `${item.controlId ?? 'control'} | ${item.elementType || 'element'} | ${sanitizeGenericOutput(normalizeLine(item.label || '', 100))}`);
  return {
    summary: items.length ? `${items.length} controlli interattivi rilevati` : 'nessun controllo interattivo rilevato',
    topControls,
  };
}

function buildWindowSummary(windows = []) {
  return (Array.isArray(windows) ? windows : [])
    .slice(0, 6)
    .map((item) => `${sanitizeGenericOutput(normalizeLine(item.title || 'window', 80))}${item.process ? ` (${sanitizeGenericOutput(normalizeLine(item.process, 40))})` : ''}`);
}

async function agentLoop(requestId, userText, prompt, sessionInfo, options = {}) {
  let currentPrompt = prompt;
  let turnCount = 0;
  let lastResponse = null;
  let allToolResults = [];
  const rebuildPrompt = typeof options.rebuildPrompt === 'function'
    ? options.rebuildPrompt
    : (() => prompt);

  while (turnCount < MAX_AGENT_TURNS) {
    turnCount += 1;

    if (activeResponseId !== requestId) {
      return { cancelled: true, lastResponse, turns: turnCount, toolResults: allToolResults };
    }

    const turn = await runAcpTurn(requestId, currentPrompt, userText, sessionInfo, {
      ...options,
      streamPreview: turnCount === 1,
    });

    const phasePlan = turn.phasePlan || normalizeLegacyResponseToPhasePlan(turn.response, userText);
    const phases = Array.isArray(phasePlan?.phases) ? phasePlan.phases : [];

    if (!phases.length) {
      lastResponse = turn.response;
      break;
    }

    let nextPromptAfterTools = null;
    let shouldContinueLoop = false;

    for (const phase of phases) {
      const phaseId = String(phase?.phaseId || `phase-${turnCount}`).trim() || `phase-${turnCount}`;
      const phaseKind = String(phase?.kind || 'message').trim().toLowerCase();

      if (phaseKind === 'status') {
        emitPhaseStreamEvent(requestId, phaseId, phaseKind, {
          type: 'phase_status',
          message: {
            id: createMessageId('system'),
            requestId,
            phaseId,
            phaseKind,
            role: 'system',
            text: phase.statusText || '',
            ts: new Date().toISOString(),
          },
        });
        if (phase.speak === true) {
          // eslint-disable-next-line no-await-in-loop
          await emitSpokenStatusUpdate(requestId, phaseId, phase.statusText, { emotion: 'think', gesture: 'index' });
        }
        continue;
      }

      if (phaseKind === 'message') {
        if (phase.response?.sequence?.length) {
          lastResponse = phase.response;
          emitPhaseStreamEvent(requestId, phaseId, phaseKind, { type: 'phase_started' });
          // eslint-disable-next-line no-await-in-loop
          await emitPhaseAssistantMessage(requestId, phaseId, phaseKind, userText, phase.response);
        }
        continue;
      }

      if (phaseKind === 'blocked') {
        if (phase.response?.sequence?.length) {
          lastResponse = phase.response;
          emitPhaseStreamEvent(requestId, phaseId, phaseKind, { type: 'phase_started' });
          // eslint-disable-next-line no-await-in-loop
          await emitPhaseAssistantMessage(requestId, phaseId, phaseKind, userText, phase.response);
        }
        return { cancelled: false, blocked: true, lastResponse, turns: turnCount, toolResults: allToolResults };
      }

      if (phaseKind === 'final') {
        if (phase.response?.sequence?.length) {
          lastResponse = phase.response;
          emitPhaseStreamEvent(requestId, phaseId, phaseKind, { type: 'phase_started' });
          // eslint-disable-next-line no-await-in-loop
          await emitPhaseAssistantMessage(requestId, phaseId, phaseKind, userText, phase.response);
        }
        return { cancelled: false, completed: true, lastResponse, turns: turnCount, toolResults: allToolResults };
      }

      if (phaseKind !== 'tool_batch') {
        continue;
      }

      const phaseSequence = Array.isArray(phase.sequence) ? phase.sequence : [];
      const dataToolCalls = extractToolCalls(phaseSequence);
      const actionCalls = extractActionCalls(phaseSequence);
      const { available: executableActionCalls, blocked: blockedActionCalls } = partitionAvailableToolCalls(actionCalls);
      const { available: executableDataToolCalls, blocked: blockedDataToolCalls } = partitionAvailableToolCalls(dataToolCalls);
      const blockedResults = [...blockedActionCalls, ...blockedDataToolCalls];
      if (blockedResults.length) {
        allToolResults.push(...blockedResults);
      }
      const actionExecutionResults = [];
      const executableToolNames = [...executableActionCalls, ...executableDataToolCalls].map((call) => call.type);
      const autoStartText = buildAutoToolBatchStartText(executableActionCalls, executableDataToolCalls);

      if (autoStartText) {
        // eslint-disable-next-line no-await-in-loop
        await emitSpokenStatusUpdate(requestId, phaseId, autoStartText, {
          emotion: executableToolNames.includes('browser') ? 'think' : 'neutral',
          gesture: executableToolNames.includes('browser') ? 'index' : undefined,
        });
      }

      emitPhaseStreamEvent(requestId, phaseId, phaseKind, {
        type: 'phase_tool_start',
        tools: executableToolNames,
        turn: turnCount,
      });

      for (const actionCall of executableActionCalls) {
        if (actionCall.type === 'avatar' || actionCall.type === 'delay') {
          continue;
        }
        if (actionCall.type === 'browser') {
          // eslint-disable-next-line no-await-in-loop
          const browserResult = await handleBrowserDirective(actionCall.directive);
          actionExecutionResults.push(buildBrowserActionExecutionResult(actionCall.directive, browserResult, canvasState));
        } else if (actionCall.type === 'computer') {
          // eslint-disable-next-line no-await-in-loop
          const computerResult = await handleComputerDirective({ ...actionCall.directive, requestId });
          if (computerResult?.ok === false) {
            actionExecutionResults.push({
              type: 'computer',
              ok: false,
              action: actionCall.directive?.action || '',
              error: sanitizeGenericOutput(computerResult.error),
              note: sanitizeGenericOutput(computerResult?.warning || ''),
              warnings: [sanitizeGenericOutput(computerResult?.warning || computerResult?.error || '')].filter(Boolean),
            });
          } else {
            const interactiveSummary = buildComputerInteractiveSummary(computerState.interactiveElements);
            actionExecutionResults.push({
              type: 'computer',
              ok: true,
              action: actionCall.directive?.action || '',
              windowTitle: sanitizeGenericOutput(String(computerResult?.windowTitle || computerResult?.title || '').trim()),
              note: sanitizeGenericOutput(String(computerResult?.message || computerResult?.warning || '').trim()),
              interactiveSummary: interactiveSummary.summary,
              topControls: interactiveSummary.topControls,
              windowSummary: buildWindowSummary(computerState.windows),
              warnings: [sanitizeGenericOutput(computerResult?.warning || '')].filter(Boolean),
            });
          }
        } else if (actionCall.type === 'workspace') {
          const workspaceResult = applyWorkspaceUpdate(actionCall.directive);
          if (workspaceResult?.ok === false) {
            actionExecutionResults.push({
              type: 'workspace',
              ok: false,
              error: workspaceResult.error,
              mode: String(actionCall.directive?.mode || 'append').trim(),
              warnings: [workspaceResult.error || ''].filter(Boolean),
            });
          } else {
            actionExecutionResults.push({
              type: 'workspace',
              ok: true,
              file: workspaceResult.file || '',
              path: workspaceResult.path || '',
              skipped: Boolean(workspaceResult.skipped),
              mode: String(actionCall.directive?.mode || 'append').trim(),
              summary: workspaceResult.skipped ? 'contenuto gia presente, nessuna modifica applicata' : 'workspace aggiornato con successo',
              warnings: [],
            });
          }
        } else if (actionCall.type === 'canvas') {
          // eslint-disable-next-line no-await-in-loop
          await handleCanvasDirective(actionCall.directive);
          actionExecutionResults.push({
            type: 'canvas',
            ok: true,
            contentType: String(canvasState.content?.type || '').trim(),
            title: String(canvasState.content?.title || '').trim(),
            summary: canvasState.content?.type === 'browser'
              ? `browser canvas attivo su ${String(canvasState.content?.pageTitle || canvasState.content?.title || 'Browser').trim()}`
              : `canvas aggiornato con contenuto ${String(canvasState.content?.type || 'unknown').trim()}`,
            warnings: [],
          });
        }
      }

      if (actionExecutionResults.length) {
        allToolResults.push(...actionExecutionResults);
      }
      const nonSpeechToolResults = [...blockedResults, ...actionExecutionResults];

      if (!executableDataToolCalls.length) {
        if (nonSpeechToolResults.length) {
          emitPhaseStreamEvent(
            requestId,
            phaseId,
            phaseKind,
            nonSpeechToolResults.some((result) => !result.ok)
              ? {
                type: 'phase_tool_error',
                errors: nonSpeechToolResults.filter((result) => !result.ok).map((result) => `${result.type}: ${result.error}`).join('; '),
                turn: turnCount,
              }
              : {
                type: 'phase_tool_complete',
                tools: nonSpeechToolResults.map((result) => result.type),
                turn: turnCount,
              }
          );

          const autoCompleteText = buildAutoToolBatchCompleteText(nonSpeechToolResults);
          if (autoCompleteText) {
            // eslint-disable-next-line no-await-in-loop
            await emitSpokenStatusUpdate(requestId, phaseId, autoCompleteText, {
              emotion: nonSpeechToolResults.some((result) => !result.ok) ? 'fear' : 'happy',
              gesture: nonSpeechToolResults.some((result) => !result.ok) ? 'shrug' : 'thumbup',
              hand: nonSpeechToolResults.some((result) => !result.ok) ? 'both' : 'right',
            });
          }

          const refreshedPrompt = rebuildPrompt(userText);
          nextPromptAfterTools = [
            refreshedPrompt,
            '',
            `--- TURN ${turnCount} PHASE ${phaseId} TOOL RESULTS ---`,
            buildToolResultPrompt(nonSpeechToolResults, userText),
          ].join('\n\n');
          shouldContinueLoop = true;
        }
        continue;
      }

      const results = await executeToolCalls(executableDataToolCalls);
      const combinedResults = [...nonSpeechToolResults, ...results];
      allToolResults.push(...results);
      const hasErrors = combinedResults.some((r) => !r.ok);

      emitPhaseStreamEvent(
        requestId,
        phaseId,
        phaseKind,
        hasErrors
          ? {
            type: 'phase_tool_error',
            errors: combinedResults.filter((r) => !r.ok).map((r) => `${r.type}: ${r.error}`).join('; '),
            turn: turnCount,
          }
          : {
            type: 'phase_tool_complete',
            tools: combinedResults.map((r) => r.type),
            turn: turnCount,
          }
      );

      const autoCompleteText = buildAutoToolBatchCompleteText(combinedResults);
      if (autoCompleteText) {
        // eslint-disable-next-line no-await-in-loop
        await emitSpokenStatusUpdate(requestId, phaseId, autoCompleteText, {
          emotion: hasErrors ? 'fear' : 'happy',
          gesture: hasErrors ? 'shrug' : 'thumbup',
          hand: hasErrors ? 'both' : 'right',
        });
      }

      const refreshedPrompt = rebuildPrompt(userText);
      nextPromptAfterTools = [
        refreshedPrompt,
        '',
        `--- TURN ${turnCount} PHASE ${phaseId} TOOL RESULTS ---`,
        buildToolResultPrompt(combinedResults, userText),
      ].join('\n\n');
      shouldContinueLoop = true;
      break;
    }

    if (shouldContinueLoop) {
      currentPrompt = nextPromptAfterTools || rebuildPrompt(userText);
      continue;
    }

    lastResponse = turn.response || lastResponse;
    break;
  }

  if (turnCount >= MAX_AGENT_TURNS) {
    emitSystemChatStream(requestId, `Agent loop: massimo ${MAX_AGENT_TURNS} turni raggiunto.`);
  }

  return { cancelled: false, completed: false, lastResponse, turns: turnCount, toolResults: allToolResults };
}

async function startDirectAcpRequest(requestId, userText) {
  resetBrowserAgentState();
  const selectedBrain = getSelectedBrainOption();

  if (!hasSelectedBrainLauncher()) {
    const errorMessage = {
      id: createMessageId('system'),
      role: 'system',
      text: `ACP non disponibile: launcher ${selectedBrain.label} non trovato (${selectedBrain.commandPath}).`,
      ts: new Date().toISOString(),
    };
    appendHistoryMessage(errorMessage);
    emitChatStream({ type: 'error', requestId, error: errorMessage.text, message: errorMessage });
    setStatus('error');
    setBrainMode('direct-acp-missing');
    setStreamStatus(STREAM_STATUS.DISCONNECTED);
    setTtsState('error', { error: errorMessage.text });
    return;
  }

  await refreshComputerState().catch(() => null);
  const prompt = buildDirectAcpPrompt(userText);
  const sessionInfo = prepareAcpSessionTurn();
  const launch = await getBrainSpawnConfig(prompt, sessionInfo);
  
  activeResponseId = requestId;

  setStatus('thinking');
  setBrainMode('direct-acp-streaming');
  setStreamStatus(STREAM_STATUS.WAIT);
  sendAvatarCommand({ cmd: 'expression', expression: 'think' });
  sendAvatarCommand({ cmd: 'gesture', gesture: 'index', duration: 6 });
  emitChatStream({ type: 'started', requestId });

  try {
    const result = await agentLoop(requestId, userText, prompt, sessionInfo, {
      rebuildPrompt: buildDirectAcpPrompt,
      streamPreview: launch.kind !== 'ollama-http',
      strictJson: true,
    });

    if (result.cancelled) {
      activeResponseId = null;
      setStatus('idle');
      setBrainMode('direct-acp-ready');
      setStreamStatus(STREAM_STATUS.CONNECTED);
      return;
    }

    const finalSessionId = activeChatRequest?.acpSessionId || sessionInfo.id;
    if (activeChatRequest?.id === requestId) {
      activeChatRequest.streamEmitter?.stop();
      activeChatRequest = null;
    }
    markAcpSessionTurnCompleted(finalSessionId);
    consumeStartupBootPrompt();
    setStatus('idle');
    setBrainMode('direct-acp-ready');
    setStreamStatus(STREAM_STATUS.CONNECTED);
  } catch (error) {
    const active = activeChatRequest;
    const cancelled = Boolean(active?.cancelled);
    const stopReason = active?.stopReason;
    const acpSessionId = active?.acpSessionId || sessionInfo.id;
    const acpSessionNew = Boolean(active?.acpSessionNew ?? sessionInfo.isNew);

    if (active?.id === requestId) {
      active.streamEmitter?.stop();
      activeChatRequest = null;
    }

    if (cancelled) {
      if (acpSessionNew) {
        resetAcpSession(acpSessionId);
      }
      activeResponseId = null;
      const systemMessage = {
        id: createMessageId('system'),
        role: 'system',
        text: stopReason === 'timeout' ? 'Risposta interrotta per timeout.' : 'Risposta interrotta.',
        ts: new Date().toISOString(),
      };
      appendHistoryMessage(systemMessage);
      emitChatStream({ type: 'stopped', requestId, message: systemMessage });
      setStatus('idle');
      setBrainMode('direct-acp-ready');
      setStreamStatus(stopReason === 'timeout' ? STREAM_STATUS.TIMEOUT : STREAM_STATUS.CONNECTED);
      setTtsState('idle', { error: null });
      return;
    }

    activeResponseId = null;
    const systemMessage = {
      id: createMessageId('system'),
      role: 'system',
      text: error.message || 'Errore ACP diretto',
      ts: new Date().toISOString(),
    };
    appendHistoryMessage(systemMessage);
    emitChatStream({ type: 'error', requestId, error: systemMessage.text, message: systemMessage });
    setStatus('error');
    setBrainMode('direct-acp-error');
    setStreamStatus(STREAM_STATUS.ERROR);
    setTtsState('error', { error: systemMessage.text });
  }
}

async function startBootstrapAcpRequest(requestId, userText, options = {}) {
  resetBrowserAgentState();
  const selectedBrain = getSelectedBrainOption();

  if (!hasSelectedBrainLauncher()) {
    const errorMessage = {
      id: createMessageId('system'),
      role: 'system',
      text: `ACP non disponibile: launcher ${selectedBrain.label} non trovato (${selectedBrain.commandPath}).`,
      ts: new Date().toISOString(),
    };
    appendHistoryMessage(errorMessage);
    emitChatStream({ type: 'error', requestId, error: errorMessage.text, message: errorMessage });
    setStatus('error');
    setBrainMode('direct-acp-missing');
    setStreamStatus(STREAM_STATUS.DISCONNECTED);
    setTtsState('error', { error: errorMessage.text });
    return;
  }

  const sessionInfo = prepareAcpSessionTurn();
  activeChatRequest = {
    id: requestId,
    proc: null,
    cancelled: false,
    stopReason: null,
    buffer: '',
    preview: '',
    acpSessionId: sessionInfo.id,
    acpSessionNew: sessionInfo.isNew,
    streamEmitter: createStreamEmitter(requestId),
  };
  activeResponseId = requestId;

  setStatus('thinking');
  setBrainMode('direct-acp-bootstrap');
  setStreamStatus(STREAM_STATUS.WAIT);
  sendAvatarCommand({ cmd: 'expression', expression: 'think' });
  emitChatStream({ type: 'started', requestId });

  try {
    const prompt = buildBootstrapAcpPrompt(userText, options);
    const turn = await runAcpTurn(requestId, prompt, userText, sessionInfo, { streamPreview: true, strictJson: true });

    if (activeChatRequest?.id === requestId) {
      activeChatRequest.streamEmitter?.stop();
      activeChatRequest = null;
    }

    updateBootstrapStateFromAcp(bootstrapState, turn.response.reasoning, options);

    await finalizeParsedAssistantReply(
      requestId,
      userText,
      turn.response,
      { id: sessionInfo.id },
      {
        consumeStartupBoot: false,
        messageMeta: { bootstrap: true },
      },
    );
  } catch (error) {
    if (activeChatRequest?.id === requestId) {
      activeChatRequest.streamEmitter?.stop();
      activeChatRequest = null;
    }

    activeResponseId = null;
    const wasTimeout = /timeout/i.test(error?.message || '') || error?.code === 'timeout';
    const wasCancelled = /cancelled|user-stop/i.test(error?.message || '') || error?.code === 'user-stop';

    if (sessionInfo.isNew) {
      resetAcpSession(sessionInfo.id);
    }

    const systemMessage = {
      id: createMessageId('system'),
      role: 'system',
      text: wasCancelled
        ? 'Bootstrap interrotto.'
        : (wasTimeout ? 'Bootstrap interrotto per timeout.' : (error?.message || 'Errore nel bootstrap ACP')),
      ts: new Date().toISOString(),
    };

    appendHistoryMessage(systemMessage);
    emitChatStream({
      type: wasCancelled ? 'stopped' : 'error',
      requestId,
      error: wasCancelled ? undefined : systemMessage.text,
      message: systemMessage,
    });
    setStatus(wasCancelled ? 'idle' : 'error');
    setBrainMode(wasCancelled ? 'direct-acp-ready' : 'direct-acp-error');
    setStreamStatus(wasCancelled ? STREAM_STATUS.CONNECTED : (wasTimeout ? STREAM_STATUS.TIMEOUT : STREAM_STATUS.ERROR));
    setTtsState(wasCancelled ? 'idle' : 'error', { error: wasCancelled ? null : systemMessage.text });
  }
}

function reportDetachedAsyncError(context, error, requestId = null) {
  const detail = normalizeLine(error?.message || String(error || context), 400);
  console.error(`[${context}]`, error);

  if (requestId) {
    const systemMessage = {
      id: createMessageId('system'),
      role: 'system',
      text: detail || `Errore in ${context}`,
      ts: new Date().toISOString(),
    };
    appendHistoryMessage(systemMessage);
    emitChatStream({ type: 'error', requestId, error: systemMessage.text, message: systemMessage });
    setStatus('error');
    setBrainMode('direct-acp-error');
    setStreamStatus(STREAM_STATUS.ERROR);
    setTtsState('error', { error: systemMessage.text });
  }
}

function loadRendererWindow(targetWindow, screenName) {
  const loadPromise = isDev
    ? targetWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?screen=${encodeURIComponent(screenName)}`)
    : targetWindow.loadURL(`app://app/index.html?screen=${encodeURIComponent(screenName)}`);

  void Promise.resolve(loadPromise).catch((error) => {
    reportDetachedAsyncError(`loadRendererWindow:${screenName}`, error);
  });
}







function ensureWindows() {
  // Create chat window first — it's lighter and initialises faster.
  if (!wmGetChatWindow() || wmGetChatWindow().isDestroyed()) {
    const { window, statusLoop } = wmCreateChatWindow(app, {
      avatarWindow: wmGetAvatarWindow(),
      onStatusBroadcast: broadcastStatus,
      getStatePayload: getAppStatePayload,
    });
    wmSetChatWindow(window);
    chatStatusLoop = statusLoop;
  }

  // Delay avatar window creation so the chat GPU context is fully established
  // before the heavy WebGL/Three.js context starts — prevents simultaneous
  // AllocateRingBuffer failures (ERR_INSUFFICIENT_RESOURCES).
  const needsAvatar = !wmGetAvatarWindow() || wmGetAvatarWindow().isDestroyed();
  if (needsAvatar) {
    setTimeout(() => {
      if (!wmGetAvatarWindow() || wmGetAvatarWindow().isDestroyed()) {
        const { window, statusLoop } = wmCreateAvatarWindow(app, {
          onStatusBroadcast: broadcastStatus,
          onCanvasSync: syncCanvasToAvatar,
          getStatePayload: getAppStatePayload,
        });
        wmSetAvatarWindow(window);
        avatarStatusLoop = statusLoop;
      }
    }, 1500);
  }

  if (ENABLE_LIVE_CANVAS && canvasState.isOpen && (!wmGetCanvasWindow() || wmGetCanvasWindow().isDestroyed())) {
    const { window, statusLoop } = wmCreateCanvasWindow(app, {
      avatarWindow: wmGetAvatarWindow(),
      chatWindow: wmGetChatWindow(),
      canvasState,
      onStatusBroadcast: broadcastStatus,
      getStatePayload: getAppStatePayload,
    });
    wmSetCanvasWindow(window);
    canvasStatusLoop = statusLoop;
  }
}

app.whenReady().then(() => {
  installAppProtocol(protocol, electronNet, { distRoot: path.join(__dirname, '..', 'dist') });
  session.defaultSession.setPermissionRequestHandler(createPermissionRequestHandler());
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...(details.responseHeaders || {}) };
    if (isTrustedAppUrl(details.url)) {
      responseHeaders['Content-Security-Policy'] = [buildRendererCsp({ isDev })];
    }
    callback({ responseHeaders });
  });

  loadPersistentData();

  initializeHooks();

  // Load personality
  const personalityPath = path.join(getWorkspacePath(), 'PERSONALITY.md');
  personalityState = loadPersonality(personalityPath);

  // Auto-read workspace files and inject into prompt
  const wsPath = getWorkspacePath();
  for (const fileName of ['USER.md', 'SOUL.md', 'IDENTITY.md', 'AGENTS.md', 'TOOLS.md']) {
    const filePath = path.join(wsPath, fileName);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.trim()) {
          // Store in nyxMemory for prompt injection
          nyxMemory[fileName.replace('.md', '').toLowerCase()] = content.trim().slice(0, 2000);
        }
      } catch {}
    }
  }

  // Schedule dream mode
  scheduleDream(dreamState, async () => {
    await runDreamCycle(personalityPath);
  });

  if (!ENABLE_LIVE_CANVAS && canvasState.isOpen) {
    canvasState = {
      ...canvasState,
      isOpen: false,
      lastAvatarBoundsBeforeSplit: null,
    };
    persistCanvasState();
  }
  setStreamStatus(hasSelectedBrainLauncher() ? STREAM_STATUS.CONNECTED : STREAM_STATUS.DISCONNECTED);

  registerSafeIpcHandlers(ipcMain, {
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
    handleTaskAction: (action, params) => handleTaskAction(taskState, action, params),
    getTaskSummary: () => getTaskSummary(taskState),
    detectFrustration,
    getCircuitBreakerStatus: () => getCircuitBreakerStatus(circuitBreakerState),
    resetCircuitBreaker: () => resetCircuitBreaker(circuitBreakerState),
    getDreamStatus: () => getDreamStatus(dreamState),
    getPersonalityState: () => personalityState,
    getPersonalityPrompt: () => getPersonalityPrompt(personalityState),
    getPromptStats: () => getPromptStats(promptCacheState),
    getChatHistory: () => chatHistory,
    setWindowAlwaysOnTop,
    readClipboardText: () => clipboard.readText(),
    writeClipboardText: (text) => {
      clipboard.writeText(String(text || ''));
      return { ok: true };
    },
    // Avatar typed command infrastructure
    getAvatarWindow: wmGetAvatarWindow,
    handleAvatarPlaybackInternal: (_resolvePlaybackWaiter, _makePlaybackKey, _activeResponseId, payload) => {
      const requestId = String(payload?.requestId || '').trim();
      const segmentId = String(payload?.segmentId || '').trim();
      const state = String(payload?.state || '').trim().toLowerCase();
      if (!requestId || !segmentId) return;
      const key = makePlaybackKey(requestId, segmentId);
      if (state === 'ended' || state === 'stopped' || state === 'error') {
        resolvePlaybackWaiter(key, activeResponseId === requestId && state === 'ended');
      }
    },
    resolvePlaybackWaiter,
    makePlaybackKey,
    activeResponseId,
  });

  registerValidatedIpcHandler(ipcMain, 'canvas:get-state', async () => {
    if (canvasState.content?.type === 'browser') {
      const refreshedContent = await buildCanvasContent(canvasState.content, {
        browser: { navigate: false },
      });
      canvasState = {
        ...canvasState,
        content: refreshedContent,
      };
      persistCanvasState();
    }

    return {
      ok: true,
      state: canvasState,
    };
  });

  registerValidatedIpcHandler(ipcMain, 'canvas:open', async (_event, payload) => handleCanvasDirective({ action: 'open', ...(payload || {}) }));
  registerValidatedIpcHandler(ipcMain, 'canvas:update', async (_event, payload) => handleCanvasDirective({ action: 'open', ...(payload || {}) }));
  registerValidatedIpcHandler(ipcMain, 'canvas:close', async () => closeCanvas());
  registerValidatedIpcHandler(ipcMain, 'canvas:set-layout', async (_event, layout) => openCanvas({
    layout,
    content: canvasState.content,
    buildOptions: canvasState.content?.type === 'browser'
      ? { browser: { navigate: false } }
      : {},
  }));
  registerValidatedIpcHandler(ipcMain, 'browser:navigate', async (_event, payload) => {
    return navigateBrowserCanvas({
      title: payload?.title || canvasState.content?.title || 'Browser',
      url: payload?.url || payload?.value || payload?.query || canvasState.content?.url || '',
    });
  });
  registerValidatedIpcHandler(ipcMain, 'browser:refresh', async (_event, payload) => {
    return refreshBrowserCanvas(payload || {}, { navigate: false, showCanvas: false });
  });
  registerValidatedIpcHandler(ipcMain, 'browser:action', async (_event, payload) => {
    return baPerformBrowserAction(payload || {}, canvasState, refreshBrowserCanvas);
  });
  registerValidatedIpcHandler(ipcMain, 'chat:stop', async () => stopActiveChatRequest('user-stop'));

  registerValidatedIpcHandler(ipcMain, 'chat:send', async (_event, text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'Empty message' };
    }

    if (activeChatRequest) {
      return { ok: false, error: 'Another response is already running' };
    }

    if (activeResponseId) {
      resolvePlaybackWaitersForRequest(activeResponseId, false);
      activeResponseId = null;
      clearSpeechResetTimer();
      sendAvatarCommand({ cmd: 'stop' });
      setStatus('idle');
      setStreamStatus(STREAM_STATUS.CONNECTED);
    }

    const isBootstrapTurn = workspaceState.bootstrapPending || bootstrapState.active;
    const requestId = createRequestId();

    const frustrationResult = detectFrustration(trimmed);
    if (frustrationResult.frustrated) {
      personalityState.empathyLevel = Math.min(1, personalityState.empathyLevel + 0.05);
      personalityState.energyLevel = Math.max(0, personalityState.energyLevel - 0.05);
      emitHook(HOOK_EVENTS.FRUSTRATION, { text: trimmed, score: frustrationResult.score });
    }

    const pruneResult = smartPrune(chatHistory, trimmed);
    if (pruneResult.action !== 'none') {
      emitHook(HOOK_EVENTS.CONTEXT_PRUNE, { chatHistory, action: pruneResult.action, pruned: pruneResult.pruned });
    }

    onUserInteraction(dreamState);
    scheduleDream(dreamState, async () => {
      await runDreamCycle(personalityPath);
    });

    const userMessage = {
      id: createMessageId('user'),
      requestId,
      role: 'user',
      text: trimmed,
      meta: isBootstrapTurn ? { bootstrap: true } : undefined,
      ts: new Date().toISOString(),
    };

    appendHistoryMessage(userMessage);

    const localCommandResult = await runLocalChatCommand(trimmed);
    if (localCommandResult) {
      appendHistoryMessage(localCommandResult.message);
      return {
        ok: true,
        requestId: null,
        replaceHistory: Boolean(localCommandResult.replaceHistory),
        messages: localCommandResult.replaceHistory
          ? chatHistory
          : [userMessage, localCommandResult.message],
      };
    }

    if (isBootstrapTurn) {
      if (!bootstrapState.active) {
        startBootstrapWizard();
        void startBootstrapAcpRequest(requestId, trimmed, { mode: 'start' }).catch((error) => {
          reportDetachedAsyncError('startBootstrapAcpRequest:start', error, requestId);
        });
      } else {
        void startBootstrapAcpRequest(requestId, trimmed, { mode: 'answer' }).catch((error) => {
          reportDetachedAsyncError('startBootstrapAcpRequest:answer', error, requestId);
        });
      }

      return {
        ok: true,
        requestId,
        replaceHistory: false,
        messages: [userMessage],
      };
    }

    void startDirectAcpRequest(requestId, trimmed).catch((error) => {
      reportDetachedAsyncError('startDirectAcpRequest', error, requestId);
    });

    return {
      ok: true,
      requestId,
      messages: [userMessage],
    };
  });

  ensureWindows();
  if (TTS_PROVIDER === 'kokoro' && !ttsWarmupTimer) {
    ttsWarmupTimer = setTimeout(() => {
      ttsWarmupTimer = null;
      void ensureTtsService().catch((error) => {
        const errorMessage = error?.message || String(error);
        ttsServiceLogTail = ttsService.getLogTail();
        appendTtsServiceLog(errorMessage, 'startup');
      });
    }, 5000);
  }
  void ensureQwenAcpRuntime().catch((error) => {
    appendQwenAcpStderr(`Startup ACP init error: ${error.message || String(error)}`);
  });

  app.on('activate', () => {
    ensureWindows();
  });
});

app.on('before-quit', () => {
  cleanupRuntime();
});

app.on('window-all-closed', () => {
  cleanupRuntime();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
