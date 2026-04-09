const path = require('path');

// ============================================================
// Environment defaults
// ============================================================

function env(key, fallback) {
  return process.env[key] !== undefined ? process.env[key] : fallback;
}

function envNum(key, fallback) {
  const v = process.env[key];
  return v !== undefined ? Number(v) : fallback;
}

function envBool(key, fallback) {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return String(v).trim().toLowerCase() === 'true';
}

// ============================================================
// Paths
// ============================================================

const APP_DATA_NPM = path.join(process.env.APPDATA || '', 'npm');
const QWEN_PS1_PATH = path.join(APP_DATA_NPM, 'qwen.ps1');
const QWEN_CLI_JS_PATH = path.join(APP_DATA_NPM, 'node_modules', '@qwen-code', 'qwen-code', 'cli.js');
const PINCHTAB_PS1_PATH = path.join(APP_DATA_NPM, 'pinchtab.ps1');
const PINCHTAB_CLI_PATH = path.join(APP_DATA_NPM, 'node_modules', 'pinchtab', 'bin', 'pinchtab');

const AGENT_ROUTER_ROOT = env('NYX_AGENT_ROUTER_ROOT', path.join(process.env.USERPROFILE || '', 'Desktop', 'mpc-kalysenza docker'));
const AGENT_ROUTER_PATH = path.join(AGENT_ROUTER_ROOT, 'agent_router.py');
const AGENT_MODELS_CONFIG_PATH = path.join(AGENT_ROUTER_ROOT, 'agent_models_config.json');

const KOKORO_SERVER_SCRIPT = path.join(__dirname, '..', 'electron', 'kokoro_tts_server.py');

// ============================================================
// Timeouts (ms)
// ============================================================

const ACP_TIMEOUT_MS = envNum('AVATAR_ACP_TIMEOUT_MS', 120000);
const COMPUTER_ACTION_TIMEOUT_MS = envNum('AVATAR_COMPUTER_ACTION_TIMEOUT_MS', 20000);
const PINCHTAB_STARTUP_TIMEOUT_MS = envNum('PINCHTAB_STARTUP_TIMEOUT_MS', 45000);
const PYWINAUTO_MCP_STARTUP_TIMEOUT_MS = envNum('PYWINAUTO_MCP_STARTUP_TIMEOUT_MS', 120000);
const KOKORO_STARTUP_TIMEOUT_MS = envNum('KOKORO_STARTUP_TIMEOUT_MS', 120000);
const OLLAMA_PROBE_TIMEOUT_MS = 6000;
const OLLAMA_PROBE_MAX_TIME = 4;
const SOCKET_CONNECT_TIMEOUT_MS = 800;
const SOCKET_RETRY_INTERVAL_MS = 200;
const BROWSER_NAV_WAIT_MS = 3000;
const BROWSER_ACTION_WAIT_AFTER_MS = 1200;
const BROWSER_ACTION_WAIT_FOCUS_MS = 250;
const FOREGROUND_WINDOW_SETTLE_MS = 120;
const APP_LAUNCH_SETTLE_MS = 300;
const FILE_SAVE_VERIFY_POLL_MS = 250;
const FILE_SAVE_VERIFY_ATTEMPTS = 10;
const PERSIST_WINDOW_STATE_DEBOUNCE_MS = 200;
const RENDERER_LOOP_INTERVAL_MS = 2000;
const AVATAR_STATUS_LOOP_INTERVAL_MS = 2000;
const TTS_SERVICE_POLL_MS = 1000;
const PINCHTAB_SERVICE_POLL_MS = 1000;
const PYWINAUTO_MCP_POLL_MS = 800;
const SPEECH_RESET_TIMER_MS = 5000;
const AVATAR_PLAYBACK_WAIT_EXTRA_MS = 1500;
const AVATAR_MOTION_RESET_DURATION_S = 6;
const DELAY_MAX_SECONDS = 3;
const BRAIN_TEST_TIMEOUT_MS = 30000;

// ============================================================
// Limits
// ============================================================

const MAX_CHAT_HISTORY = 200;
const MAX_INITIAL_PROMPT_HISTORY = 4;
const BROWSER_AGENT_HARD_LIMIT = Math.max(8, envNum('AVATAR_BROWSER_AGENT_HARD_LIMIT', 64));
const COMPUTER_OCR_MAX_CHARS = envNum('AVATAR_COMPUTER_OCR_MAX_CHARS', 1200);
const WORKSPACE_FILE_MAX_CHARS = envNum('NYX_WORKSPACE_FILE_MAX_CHARS', 4000);
const WORKSPACE_TOTAL_MAX_CHARS = envNum('NYX_WORKSPACE_TOTAL_MAX_CHARS', 24000);
const WORKSPACE_DAILY_NOTE_MAX_CHARS = envNum('NYX_WORKSPACE_DAILY_NOTE_MAX_CHARS', 1500);
const SESSION_SEARCH_MAX_RESULTS = envNum('NYX_SESSION_SEARCH_MAX_RESULTS', 5);
const MEMORY_SEARCH_MAX_RESULTS = envNum('NYX_MEMORY_SEARCH_MAX_RESULTS', 5);
const MAX_DAILY_MEMORY_NOTES = 20;
const MAX_VISIBLE_WINDOWS = 12;
const MAX_INTERACTIVE_ELEMENTS = 20;
const MAX_SNAPSHOT_ITEMS = 40;
const MAX_CANVAS_ENTRIES = 300;
const MAX_BOT_LOOP_STEPS = 64;
const MAX_STABLE_PREFERENCES = 12;
const MAX_RECENT_TOPICS = 8;
const MAX_RECENT_TURNS_FOR_SUMMARY = 10;
const MAX_RECENT_TURNS_FOR_SESSION = 12;
const MAX_COMPACT_PRESERVE_TAIL = 6;
const MAX_WORD_COUNT_REQUEST = 500;
const MIN_WORD_COUNT_REQUEST = 20;
const DEFAULT_WORD_COUNT = 100;
const MAX_PROMPT_LINE_LENGTH = 400;
const MAX_SPEECH_PREVIEW_LENGTH = 8000;
const MAX_BOT_SNAPSHOT_TEXT = 1200;
const MAX_BOT_TEXT_PREVIEW = 700;
const MAX_OCR_ERROR_LENGTH = 140;
const MAX_STATUS_ERROR_LENGTH = 220;
const MAX_BOT_RESULT_LENGTH = 240;
const MAX_USER_PREFERENCE_LENGTH = 180;
const MAX_TOPIC_LENGTH = 90;
const MAX_SUMMARY_LENGTH = 1400;
const MAX_SESSION_TURN_LENGTH = 280;
const MAX_BOOTSTRAP_FIELD_LENGTH = 280;
const MAX_BOOTSTRAP_ANSWER_LENGTH = 220;
const MAX_BOOTSTRAP_QUESTION_LENGTH = 320;
const MAX_IDENTITY_NAME_LENGTH = 120;
const MAX_PREFERRED_NAME_LENGTH = 140;
const MAX_WORKSPACE_UPDATE_TITLE_LENGTH = 120;
const MAX_CLIPBOARD_TEXT_LENGTH = 4000;
const MAX_STDERR_TAIL_LENGTH = 4000;
const MAX_PINCHTAB_LOG_TAIL = 16000;
const MAX_PYWINAUTO_LOG_TAIL = 16000;
const MAX_TTS_LOG_TAIL = 12000;
const MAX_FIND_QUERY_LENGTH = 240;
const MAX_BROWSER_ACTION_TEXT_SANITIZE = 48;
const MAX_BOT_CLICK_FALLBACK_LABEL = 80;
const MAX_BOT_CONTROL_ID_LABEL = 48;
const MAX_BOT_AUTO_ID_LABEL = 32;
const MAX_BOT_CLASS_NAME_LABEL = 24;

// ============================================================
// Network
// ============================================================

const KOKORO_HOST = env('KOKORO_HOST', '127.0.0.1');
const KOKORO_PORT = envNum('KOKORO_PORT', 5037);
const KOKORO_URL = `http://${KOKORO_HOST}:${KOKORO_PORT}`;
const PINCHTAB_HOST = env('PINCHTAB_HOST', '127.0.0.1');
const PINCHTAB_PORT = envNum('PINCHTAB_PORT', envNum('BRIDGE_PORT', 9867));
const PINCHTAB_URL = `http://${PINCHTAB_HOST}:${PINCHTAB_PORT}`;
const PINCHTAB_TOKEN = env('PINCHTAB_TOKEN', env('BRIDGE_TOKEN', ''));
const PINCHTAB_HEADLESS = envBool('PINCHTAB_HEADLESS', envBool('BRIDGE_HEADLESS', false));
const PYWINAUTO_MCP_HOST = env('PYWINAUTO_MCP_HOST', '127.0.0.1');
const PYWINAUTO_MCP_PORT = envNum('PYWINAUTO_MCP_PORT', 10789);
const PYWINAUTO_MCP_URL = `http://${PYWINAUTO_MCP_HOST}:${PYWINAUTO_MCP_PORT}`;
const PYWINAUTO_MCP_REPO_URL = env('PYWINAUTO_MCP_REPO_URL', 'https://github.com/sandraschi/pywinauto-mcp.git');
const OLLAMA_HOST = env('OLLAMA_HOST', 'http://127.0.0.1:11434');

// ============================================================
// TTS
// ============================================================

const TTS_PROVIDER = (env('AVATAR_TTS_PROVIDER', 'kokoro')).trim().toLowerCase();
const KOKORO_DEFAULT_SPEAKER = (env('KOKORO_DEFAULT_SPEAKER', 'if_sara')).trim().toLowerCase();
const KOKORO_PYTHON = env('KOKORO_PYTHON', '');

// ============================================================
// Brain
// ============================================================

const DEFAULT_BRAIN_ID = 'qwen';
const DEFAULT_OLLAMA_MODEL = env('NYX_OLLAMA_MODEL', 'qwen3.5:0.8b');
const PREFERRED_OLLAMA_MODELS = ['qwen3.5:0.8b', 'llama3.2:1b', 'qwen3:1.7b'];

// ============================================================
// Feature flags
// ============================================================

const ENABLE_LIVE_CANVAS = envBool('NYX_ENABLE_LIVE_CANVAS', true);

// ============================================================
// Workspace
// ============================================================

const WORKSPACE_DIRNAME = 'workspace';
const WORKSPACE_DAILY_MEMORY_DIRNAME = 'memory';
const SESSIONS_DIRNAME = 'sessions';
const WORKSPACE_REQUIRED_FILES = ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'IDENTITY.md', 'USER.md', 'HEARTBEAT.md'];
const WORKSPACE_MUTABLE_FILES = ['USER.md', 'SOUL.md', 'IDENTITY.md', 'MEMORY.md', 'memory.md'];

// ============================================================
// Avatar
// ============================================================

const AVATAR_SUPPORTED_EMOTIONS = ['happy', 'sad', 'angry', 'think', 'surprised', 'awkward', 'question', 'curious', 'neutral', 'fear', 'love', 'sleep', 'disgust'];
const AVATAR_GESTURES = new Set(['handup', 'ok', 'index', 'thumbup', 'thumbdown', 'side', 'shrug', 'namaste']);
const AVATAR_POSES = new Set(['straight', 'side', 'hip', 'turn', 'back', 'wide', 'oneknee', 'kneel', 'bend', 'sitting', 'dance']);
const AVATAR_ANIMATIONS = new Set(['walking']);
const AVATAR_EMOTION_ALIAS_MAP = {
  surprise: 'surprised',
  calm: 'neutral',
  excited: 'happy',
  curiosity: 'curious',
  confused: 'question',
  awkwardly: 'awkward',
  disgusted: 'disgust',
};
const AVATAR_GESTURE_ALIAS_MAP = {
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
  thanks: 'namaste',
};
const AVATAR_EXPRESSION_ALIAS_MAP = {
  question: 'think',
  curious: 'think',
  awkward: 'neutral',
};
const AVATAR_DEFAULT_INTENSITY = 0.72;
const AVATAR_DEFAULT_NEUTRAL_INTENSITY = 0.35;
const AVATAR_MOTION_DURATION_MAP = {
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
  sitting: 999999,
  straight: 6,
};
const AVATAR_MOTION_DURATION_MIN = 3;
const AVATAR_MOTION_DURATION_INTENSITY_FACTOR_LOW = 0.7;
const AVATAR_MOTION_DURATION_INTENSITY_FACTOR_HIGH = 1;

// ============================================================
// Window layout
// ============================================================

const DEFAULT_CHAT_WIDTH = 460;
const DEFAULT_CANVAS_WIDTH = 460;
const WINDOW_GAP = 24;
const WINDOW_CANVAS_GAP = 16;
const WINDOW_MIN_CHAT_WIDTH = 380;
const WINDOW_MIN_CANVAS_WIDTH = 420;
const WINDOW_MIN_AVATAR_WIDTH = 720;
const WINDOW_MIN_AVATAR_HEIGHT = 720;
const WINDOW_MIN_CHAT_HEIGHT = 640;
const WINDOW_MIN_CANVAS_HEIGHT = 480;
const WINDOW_CHAT_WIDTH_RATIO = 0.28;
const WINDOW_CANVAS_WIDTH_RATIO = 0.3;
const WINDOW_AVATAR_WIDTH_RATIO = 0.58;
const WINDOW_HEIGHT_RATIO_CHAT = 0.82;
const WINDOW_HEIGHT_RATIO_AVATAR = 0.9;
const WINDOW_SPLIT_MIN_HALF = 480;
const WINDOW_ALWAYS_ON_TOP_LEVEL_SCREEN_SAVER = 'screen-saver';
const WINDOW_ALWAYS_ON_TOP_LEVEL_FLOATING = 'floating';
const WINDOW_ALWAYS_ON_TOP_Z_ORDER = 1;

// ============================================================
// Stream emitter
// ============================================================

const STREAM_EMITTER_INITIAL_INTERVAL_MS = 40;
const STREAM_EMITTER_MIN_INTERVAL_MS = 24;
const STREAM_EMITTER_MAX_INTERVAL_MS = 140;
const STREAM_EMITTER_EMA_ALPHA = 0.8;

// ============================================================
// Reasoning tags
// ============================================================

const REASONING_TAG_NAMES = ['think', 'thought', 'reasoning', 'analysis', 'internal', 'plan'];

// ============================================================
// Stream status
// ============================================================

const STREAM_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  WAIT: 'wait',
  STREAMING: 'streaming',
  SPEAKING: 'speaking',
  TIMEOUT: 'timeout',
  ERROR: 'error',
};

// ============================================================
// Named keys (keyboard)
// ============================================================

const NAMED_KEYS = {
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

const MODIFIER_KEYS = {
  ctrl: '^',
  control: '^',
  shift: '+',
  alt: '%',
};

// ============================================================
// SendKeys special char escapes
// ============================================================

const SENDKEYS_ESCAPE_MAP = {
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

// ============================================================
// Browser action recoverable errors
// ============================================================

const PINCHTAB_RECOVERABLE_ERROR_PATTERNS = [
  { match: 'ref', and: 'not found', and2: '/snapshot' },
  { match: 'no node found for given backend id', and: '-32000' },
  { match: 'backend id', and: 'not found' },
  { match: 'element is not focusable', and: '-32000' },
];

// ============================================================
// Bootstrap fields
// ============================================================

const BOOTSTRAP_FIELDS = [
  { id: 'assistant_name', label: 'what would you like to call the assistant', prompt: 'What would you like to call the assistant? Example: Nyx, Luna, Iris.' },
  { id: 'preferred_name', label: 'how should the assistant address you', prompt: 'How should the assistant address you?' },
  { id: 'nyx_role', label: 'what role should the assistant have for you', prompt: 'What role should the assistant have by default? Example: pair programmer, desktop operator, technical assistant.' },
  { id: 'tone_style', label: 'what tone and style should it use', prompt: 'What tone and style should it use? Example: direct, technical, concise, formal.' },
  { id: 'boundaries', label: 'what constraints or things should it avoid', prompt: 'What should it always avoid or what constraints should it never break?' },
  { id: 'tool_preferences', label: 'which tools or workflows should it prefer', prompt: 'Which tools or workflows should it prefer? Example: browse before asking, canvas for long text, no markdown.' },
  { id: 'focus_context', label: 'which projects, stacks or contexts should it keep in mind', prompt: 'Which projects, stacks or contexts should it keep in mind by default?' },
];

const BOOTSTRAP_EMPTY_VALUES = new Set(['-', 'n/a', 'na', 'non specificato', 'non so', 'da definire']);

// ============================================================
// Canvas layout aliases
// ============================================================

const CANVAS_LAYOUT_ALIAS_MAP = {
  right: 'right-docked',
  docked: 'right-docked',
  'right-docked': 'right-docked',
  split: 'split-50',
  'split-50': 'split-50',
  half: 'split-50',
};

// ============================================================
// File extensions for canvas content inference
// ============================================================

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac']);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.xml', '.yml', '.yaml', '.log']);

// ============================================================
// PinchTab singleton/lock files
// ============================================================

const PINCHTAB_SINGLETON_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'SingletonStartupLock'];
const PINCHTAB_SESSION_DIR = path.join('Default', 'Sessions');
const PINCHTAB_LOCK_FILE = path.join('Default', 'LOCK');

// ============================================================
// Brain registry
// ============================================================

const BRAIN_REGISTRY = {
  qwen: {
    label: 'Qwen',
    description: 'Qwen Code CLI',
    command: 'qwen',
    args: (prompt) => [prompt],
    supportsSessionResume: true,
    acpCommand: 'qwen --acp --channel ACP',
    selectable: true,
  },
  ollama: {
    label: 'Ollama',
    description: 'Ollama local CLI',
    command: 'ollama',
    args: (prompt, config = {}) => ['run', String(config.model || 'llama3.1').trim() || 'llama3.1', prompt],
    supportsSessionResume: false,
    acpCommand: '',
    selectable: true,
  },
};

// ============================================================
// Save dialog window title patterns
// ============================================================

const SAVE_DIALOG_TITLE_PATTERNS = ['salva con nome', 'save as', 'salva', 'save'];

// ============================================================
// Computer task keywords (for distinguishing from browser tasks)
// ============================================================

const COMPUTER_TASK_KEYWORDS = [
  'blocco note', 'notepad', 'calc', 'calcolatrice', 'paint', 'powershell',
  'cmd', 'terminale', 'esplora file', 'file explorer', 'desktop',
  'finestra', 'finestre', 'applicazione', 'programma', 'scrivi',
  'digita', 'premi', 'tasto', 'hotkey', 'mouse', 'clic destro',
  'clic sinistro', '.exe',
];

// ============================================================
// Browser task keywords
// ============================================================

const BROWSER_TASK_KEYWORDS = [
  'browser', 'pinchtab', 'pagina web', 'sito', 'siti', 'url', 'link',
  'chrome', 'edge', 'web', 'naviga', 'vai su', 'apri il sito', 'apri la pagina',
  'clicca', 'click', 'compila', 'login', 'accedi', 'cerca', 'cercami',
];

// ============================================================
// Terminal response patterns (browser autopilot)
// ============================================================

const BROWSER_TERMINAL_PATTERNS = [
  'ho trovato', 'ecco il video', 'ecco i risultati', 'task completato',
  'completato', 'mi fermo', 'serve una verifica manuale', 'serve verifica manuale',
  'non sono riuscito', 'sono bloccato', 'sono bloccata', 'non posso procedere',
  'captcha', 'otp', '2fa', 'verifica email', 'verifica via email',
  'verifica telefono', 'verifica via sms', 'sms richiesto', 'codice sms',
];

// ============================================================
// Action lines to strip from canvas speech
// ============================================================

const CANVAS_ACTION_LINE_PATTERNS = [
  /^(apro|aperta|ti apro|apro la|apro il|mostro|ti mostro|ecco|fatto)\b/i,
  /\bcanvas\b/i,
  /\bcopia e incolla\b/i,
  /\bpronto da copiare\b/i,
];

// ============================================================
// Preference extraction regex
// ============================================================

const PREFERENCE_KEYWORDS = /\b(voglio|usa|usare|deve|non|separa|centr|chat|avatar|nyxavatar|animazioni|gesture|finestr|trasparente|acp|tts|lipsync)\b/i;

// ============================================================
// ACP protocol
// ============================================================

const ACP_PROTOCOL_VERSION = 1;
const ACP_CLIENT_NAME = 'avatar-acp-desktop';
const ACP_CLIENT_VERSION = '0.1.0';

// ============================================================
// PinchTab config
// ============================================================

const PINCHTAB_CONFIG_VERSION = '0.8.0';

// ============================================================
// Export
// ============================================================

module.exports = {
  // Env helpers
  env,
  envNum,
  envBool,

  // Paths
  QWEN_PS1_PATH,
  QWEN_CLI_JS_PATH,
  PINCHTAB_PS1_PATH,
  PINCHTAB_CLI_PATH,
  AGENT_ROUTER_ROOT,
  AGENT_ROUTER_PATH,
  AGENT_MODELS_CONFIG_PATH,
  KOKORO_SERVER_SCRIPT,

  // Timeouts
  ACP_TIMEOUT_MS,
  COMPUTER_ACTION_TIMEOUT_MS,
  PINCHTAB_STARTUP_TIMEOUT_MS,
  PYWINAUTO_MCP_STARTUP_TIMEOUT_MS,
  KOKORO_STARTUP_TIMEOUT_MS,
  OLLAMA_PROBE_TIMEOUT_MS,
  OLLAMA_PROBE_MAX_TIME,
  SOCKET_CONNECT_TIMEOUT_MS,
  SOCKET_RETRY_INTERVAL_MS,
  BROWSER_NAV_WAIT_MS,
  BROWSER_ACTION_WAIT_AFTER_MS,
  BROWSER_ACTION_WAIT_FOCUS_MS,
  FOREGROUND_WINDOW_SETTLE_MS,
  APP_LAUNCH_SETTLE_MS,
  FILE_SAVE_VERIFY_POLL_MS,
  FILE_SAVE_VERIFY_ATTEMPTS,
  PERSIST_WINDOW_STATE_DEBOUNCE_MS,
  RENDERER_LOOP_INTERVAL_MS,
  AVATAR_STATUS_LOOP_INTERVAL_MS,
  TTS_SERVICE_POLL_MS,
  PINCHTAB_SERVICE_POLL_MS,
  PYWINAUTO_MCP_POLL_MS,
  SPEECH_RESET_TIMER_MS,
  AVATAR_PLAYBACK_WAIT_EXTRA_MS,
  AVATAR_MOTION_RESET_DURATION_S,
  DELAY_MAX_SECONDS,
  BRAIN_TEST_TIMEOUT_MS,

  // Limits
  MAX_CHAT_HISTORY,
  MAX_INITIAL_PROMPT_HISTORY,
  BROWSER_AGENT_HARD_LIMIT,
  COMPUTER_OCR_MAX_CHARS,
  WORKSPACE_FILE_MAX_CHARS,
  WORKSPACE_TOTAL_MAX_CHARS,
  WORKSPACE_DAILY_NOTE_MAX_CHARS,
  SESSION_SEARCH_MAX_RESULTS,
  MEMORY_SEARCH_MAX_RESULTS,
  MAX_DAILY_MEMORY_NOTES,
  MAX_VISIBLE_WINDOWS,
  MAX_INTERACTIVE_ELEMENTS,
  MAX_SNAPSHOT_ITEMS,
  MAX_CANVAS_ENTRIES,
  MAX_BOT_LOOP_STEPS,
  MAX_STABLE_PREFERENCES,
  MAX_RECENT_TOPICS,
  MAX_RECENT_TURNS_FOR_SUMMARY,
  MAX_RECENT_TURNS_FOR_SESSION,
  MAX_COMPACT_PRESERVE_TAIL,
  MAX_WORD_COUNT_REQUEST,
  MIN_WORD_COUNT_REQUEST,
  DEFAULT_WORD_COUNT,
  MAX_PROMPT_LINE_LENGTH,
  MAX_SPEECH_PREVIEW_LENGTH,
  MAX_BOT_SNAPSHOT_TEXT,
  MAX_BOT_TEXT_PREVIEW,
  MAX_OCR_ERROR_LENGTH,
  MAX_STATUS_ERROR_LENGTH,
  MAX_BOT_RESULT_LENGTH,
  MAX_USER_PREFERENCE_LENGTH,
  MAX_TOPIC_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_SESSION_TURN_LENGTH,
  MAX_BOOTSTRAP_FIELD_LENGTH,
  MAX_BOOTSTRAP_ANSWER_LENGTH,
  MAX_BOOTSTRAP_QUESTION_LENGTH,
  MAX_IDENTITY_NAME_LENGTH,
  MAX_PREFERRED_NAME_LENGTH,
  MAX_WORKSPACE_UPDATE_TITLE_LENGTH,
  MAX_CLIPBOARD_TEXT_LENGTH,
  MAX_STDERR_TAIL_LENGTH,
  MAX_PINCHTAB_LOG_TAIL,
  MAX_PYWINAUTO_LOG_TAIL,
  MAX_TTS_LOG_TAIL,
  MAX_FIND_QUERY_LENGTH,
  MAX_BROWSER_ACTION_TEXT_SANITIZE,
  MAX_BOT_CLICK_FALLBACK_LABEL,
  MAX_BOT_CONTROL_ID_LABEL,
  MAX_BOT_AUTO_ID_LABEL,
  MAX_BOT_CLASS_NAME_LABEL,

  // Network
  KOKORO_HOST,
  KOKORO_PORT,
  KOKORO_URL,
  PINCHTAB_HOST,
  PINCHTAB_PORT,
  PINCHTAB_URL,
  PINCHTAB_TOKEN,
  PINCHTAB_HEADLESS,
  PYWINAUTO_MCP_HOST,
  PYWINAUTO_MCP_PORT,
  PYWINAUTO_MCP_URL,
  PYWINAUTO_MCP_REPO_URL,
  OLLAMA_HOST,

  // TTS
  TTS_PROVIDER,
  KOKORO_DEFAULT_SPEAKER,
  KOKORO_PYTHON,

  // Brain
  DEFAULT_BRAIN_ID,
  DEFAULT_OLLAMA_MODEL,
  PREFERRED_OLLAMA_MODELS,

  // Feature flags
  ENABLE_LIVE_CANVAS,

  // Workspace
  WORKSPACE_DIRNAME,
  WORKSPACE_DAILY_MEMORY_DIRNAME,
  SESSIONS_DIRNAME,
  WORKSPACE_REQUIRED_FILES,
  WORKSPACE_MUTABLE_FILES,

  // Avatar
  AVATAR_SUPPORTED_EMOTIONS,
  AVATAR_GESTURES,
  AVATAR_POSES,
  AVATAR_ANIMATIONS,
  AVATAR_EMOTION_ALIAS_MAP,
  AVATAR_GESTURE_ALIAS_MAP,
  AVATAR_EXPRESSION_ALIAS_MAP,
  AVATAR_DEFAULT_INTENSITY,
  AVATAR_DEFAULT_NEUTRAL_INTENSITY,
  AVATAR_MOTION_DURATION_MAP,
  AVATAR_MOTION_DURATION_MIN,
  AVATAR_MOTION_DURATION_INTENSITY_FACTOR_LOW,
  AVATAR_MOTION_DURATION_INTENSITY_FACTOR_HIGH,

  // Window layout
  DEFAULT_CHAT_WIDTH,
  DEFAULT_CANVAS_WIDTH,
  WINDOW_GAP,
  WINDOW_CANVAS_GAP,
  WINDOW_MIN_CHAT_WIDTH,
  WINDOW_MIN_CANVAS_WIDTH,
  WINDOW_MIN_AVATAR_WIDTH,
  WINDOW_MIN_AVATAR_HEIGHT,
  WINDOW_MIN_CHAT_HEIGHT,
  WINDOW_MIN_CANVAS_HEIGHT,
  WINDOW_CHAT_WIDTH_RATIO,
  WINDOW_CANVAS_WIDTH_RATIO,
  WINDOW_AVATAR_WIDTH_RATIO,
  WINDOW_HEIGHT_RATIO_CHAT,
  WINDOW_HEIGHT_RATIO_AVATAR,
  WINDOW_SPLIT_MIN_HALF,
  WINDOW_ALWAYS_ON_TOP_LEVEL_SCREEN_SAVER,
  WINDOW_ALWAYS_ON_TOP_LEVEL_FLOATING,
  WINDOW_ALWAYS_ON_TOP_Z_ORDER,

  // Stream emitter
  STREAM_EMITTER_INITIAL_INTERVAL_MS,
  STREAM_EMITTER_MIN_INTERVAL_MS,
  STREAM_EMITTER_MAX_INTERVAL_MS,
  STREAM_EMITTER_EMA_ALPHA,

  // Reasoning
  REASONING_TAG_NAMES,

  // Stream status
  STREAM_STATUS,

  // Keyboard
  NAMED_KEYS,
  MODIFIER_KEYS,
  SENDKEYS_ESCAPE_MAP,

  // Browser
  PINCHTAB_RECOVERABLE_ERROR_PATTERNS,

  // Bootstrap
  BOOTSTRAP_FIELDS,
  BOOTSTRAP_EMPTY_VALUES,

  // Canvas
  CANVAS_LAYOUT_ALIAS_MAP,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  TEXT_EXTENSIONS,

  // PinchTab
  PINCHTAB_SINGLETON_FILES,
  PINCHTAB_SESSION_DIR,
  PINCHTAB_LOCK_FILE,

  // Brain
  BRAIN_REGISTRY,

  // Save dialog
  SAVE_DIALOG_TITLE_PATTERNS,

  // Task keywords
  COMPUTER_TASK_KEYWORDS,
  BROWSER_TASK_KEYWORDS,

  // Browser autopilot
  BROWSER_TERMINAL_PATTERNS,

  // Canvas
  CANVAS_ACTION_LINE_PATTERNS,

  // Preferences
  PREFERENCE_KEYWORDS,

  // ACP
  ACP_PROTOCOL_VERSION,
  ACP_CLIENT_NAME,
  ACP_CLIENT_VERSION,

  // PinchTab config
  PINCHTAB_CONFIG_VERSION,
};
