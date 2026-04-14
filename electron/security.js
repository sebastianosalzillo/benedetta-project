const { URL } = require('url');

const APP_PROTOCOL_SCHEME = 'app:';
const DEFAULT_DEV_ORIGINS = new Set(['http://localhost:5174', 'http://127.0.0.1:5174']);
const TALKINGHEAD_PATH_PREFIX = '/talkinghead/';

function getAllowedDevOrigins() {
  const origins = new Set(DEFAULT_DEV_ORIGINS);
  const raw = String(process.env.VITE_DEV_SERVER_URL || '').trim();
  if (!raw) return origins;

  try {
    origins.add(new URL(raw).origin);
  } catch {
    // Ignore malformed dev server URLs; defaults remain valid.
  }

  return origins;
}

function parseUrl(value) {
  try {
    return new URL(String(value || '').trim());
  } catch {
    return null;
  }
}

function isTrustedAppUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (parsed.protocol === APP_PROTOCOL_SCHEME) return true;
  return getAllowedDevOrigins().has(parsed.origin);
}

function isAllowedWebviewSource(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;

  if (parsed.protocol === APP_PROTOCOL_SCHEME) {
    return parsed.pathname.startsWith(TALKINGHEAD_PATH_PREFIX);
  }

  return getAllowedDevOrigins().has(parsed.origin) && parsed.pathname.startsWith(TALKINGHEAD_PATH_PREFIX);
}

function getSenderUrl(event) {
  return String(
    event?.senderFrame?.url
    || event?.sender?.getURL?.()
    || '',
  ).trim();
}

function assertTrustedIpcSender(event, channel) {
  const senderUrl = getSenderUrl(event);
  if (!isTrustedAppUrl(senderUrl)) {
    throw new Error(`Blocked IPC channel "${channel}" from untrusted sender: ${senderUrl || 'unknown'}`);
  }
  return senderUrl;
}

/**
 * Check if the IPC sender is the Chat screen.
 */
function isChatScreenSender(event) {
  const senderUrl = getSenderUrl(event);
  if (!senderUrl) return false;
  try {
    const parsed = new URL(senderUrl);
    const screen = parsed.searchParams.get('screen');
    // If no screen is specified, we default to 'chat' for compatibility or security 
    // depends on the default window URL. In our app, windows are always created with screen param.
    return screen === 'chat';
  } catch {
    return false;
  }
}

/**
 * Asserts that the IPC sender is the Chat screen.
 */
function assertChatScreenSender(event, channel) {
  assertTrustedIpcSender(event, channel);
  if (!isChatScreenSender(event)) {
    throw new Error(`Unauthorized: Channel "${channel}" is restricted to the Chat screen.`);
  }
}

function registerValidatedIpcHandler(ipcMain, channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedIpcSender(event, channel);
    return handler(event, ...args);
  });
}

function registerValidatedIpcListener(ipcMain, channel, listener) {
  ipcMain.on(channel, (event, ...args) => {
    assertTrustedIpcSender(event, channel);
    listener(event, ...args);
  });
}

function createPermissionRequestHandler() {
  return (_webContents, _permission, callback) => {
    callback(false);
  };
}

function createNavigationGuard() {
  return (event, url) => {
    if (!isTrustedAppUrl(url)) {
      event.preventDefault();
    }
  };
}

function buildRendererCsp({ isDev = false, allowUnsafeEval = false } = {}) {
  const scriptSources = ["'self'", "'unsafe-inline'", 'app:', 'blob:'];
  const connectSources = ["'self'", 'app:', 'blob:'];

  if (isDev || allowUnsafeEval) {
    scriptSources.push("'unsafe-eval'");
  }

  if (isDev) {
    scriptSources.push('http://localhost:5174', 'http://127.0.0.1:5174');
    connectSources.push(
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'ws://localhost:5174',
      'ws://127.0.0.1:5174',
    );
  }

  return [
    "default-src 'self' app: data: blob:",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' app: data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    "media-src 'self' app: data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

module.exports = {
  APP_PROTOCOL_SCHEME,
  assertTrustedIpcSender,
  buildRendererCsp,
  createNavigationGuard,
  createPermissionRequestHandler,
  getAllowedDevOrigins,
  isAllowedWebviewSource,
  isChatScreenSender,
  isTrustedAppUrl,
  assertChatScreenSender,
  registerValidatedIpcHandler,
  registerValidatedIpcListener,
};
