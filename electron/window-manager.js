const path = require('path');
const { BrowserWindow, screen } = require('electron');
const {
  DEFAULT_CHAT_WIDTH,
  DEFAULT_CANVAS_WIDTH,
  WINDOW_GAP,
  WINDOW_CANVAS_GAP,
  WINDOW_MIN_AVATAR_WIDTH,
  WINDOW_MIN_AVATAR_HEIGHT,
  WINDOW_CHAT_WIDTH_RATIO,
  WINDOW_CANVAS_WIDTH_RATIO,
  WINDOW_AVATAR_WIDTH_RATIO,
  WINDOW_HEIGHT_RATIO_CHAT,
  WINDOW_HEIGHT_RATIO_AVATAR,
  WINDOW_SPLIT_MIN_HALF,
  WINDOW_ALWAYS_ON_TOP_LEVEL_SCREEN_SAVER,
  WINDOW_ALWAYS_ON_TOP_LEVEL_FLOATING,
  WINDOW_ALWAYS_ON_TOP_Z_ORDER,
  PERSIST_WINDOW_STATE_DEBOUNCE_MS,
  RENDERER_LOOP_INTERVAL_MS,
  ENABLE_LIVE_CANVAS,
} = require('./constants');
const { createRendererLoop, isRendererUnavailable } = require('./renderer-loop');

/**
 * Read/write JSON file helpers.
 */
function readJsonFile(filePath, fallback) {
  const fs = require('fs');
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

function writeJsonFile(filePath, value) {
  const fs = require('fs');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

/**
 * Get display by ID or fallback to primary.
 */
function getDisplayById(displayId) {
  return screen.getAllDisplays().find((d) => d.id === displayId) || screen.getPrimaryDisplay();
}

/**
 * Check if bounds are visible on any display.
 */
function isBoundsVisible(bounds) {
  if (!bounds) return false;
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    const horizontal = bounds.x < area.x + area.width && bounds.x + bounds.width > area.x;
    const vertical = bounds.y < area.y + area.height && bounds.y + bounds.height > area.y;
    return horizontal && vertical;
  });
}

/**
 * Calculate window layout for a display.
 */
function getWindowLayout(displayId) {
  const workArea = getDisplayById(displayId).workArea;
  const gap = WINDOW_GAP;
  const chatWidth = Math.min(DEFAULT_CHAT_WIDTH, Math.max(400, Math.floor(workArea.width * WINDOW_CHAT_WIDTH_RATIO)));
  const canvasWidth = Math.min(DEFAULT_CANVAS_WIDTH, Math.max(420, Math.floor(workArea.width * WINDOW_CANVAS_WIDTH_RATIO)));
  const chatHeight = Math.min(Math.max(760, Math.floor(workArea.height * WINDOW_HEIGHT_RATIO_CHAT)), workArea.height - gap * 2);
  const avatarWidth = Math.min(Math.max(WINDOW_MIN_AVATAR_WIDTH, Math.floor(workArea.width * WINDOW_AVATAR_WIDTH_RATIO)), workArea.width - chatWidth - gap * 3);
  const avatarHeight = Math.min(Math.max(WINDOW_MIN_AVATAR_HEIGHT, Math.floor(workArea.height * WINDOW_HEIGHT_RATIO_AVATAR)), workArea.height - gap * 2);

  return {
    avatar: { x: workArea.x + Math.max(gap, Math.floor((workArea.width - avatarWidth) / 2)), y: workArea.y + Math.max(gap, Math.floor((workArea.height - avatarHeight) / 2)), width: avatarWidth, height: avatarHeight },
    chat: { x: workArea.x + workArea.width - chatWidth - gap, y: workArea.y + Math.max(gap, Math.floor((workArea.height - chatHeight) / 2)), width: chatWidth, height: chatHeight },
    canvas: { x: workArea.x + workArea.width - canvasWidth - gap, y: workArea.y + gap, width: canvasWidth, height: workArea.height - gap * 2 },
  };
}

/**
 * Get stored window config with fallback.
 */
function getStoredWindowConfig(app, key, defaultAlwaysOnTop) {
  const statePath = getAppFilePath(app, 'window-state.json');
  const state = readJsonFile(statePath, {});
  const saved = state?.[key];
  const displayId = saved?.displayId || screen.getPrimaryDisplay().id;
  const fallbackBounds = getWindowLayout(displayId)[key];
  const bounds = saved?.bounds && isBoundsVisible(saved.bounds) ? saved.bounds : fallbackBounds;
  return { bounds, displayId, alwaysOnTop: saved?.alwaysOnTop ?? defaultAlwaysOnTop };
}

/**
 * Serialize window state for persistence.
 */
function serializeWindowState(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return undefined;
  const bounds = targetWindow.getBounds();
  const displayId = screen.getDisplayMatching(bounds).id;
  return { bounds, displayId, alwaysOnTop: targetWindow.isAlwaysOnTop() };
}

/**
 * Get app file path.
 */
function getAppFilePath(app, name) {
  return path.join(app.getPath('userData'), name);
}

/**
 * Persist window state with debouncing.
 */
let persistWindowStateTimer = null;

function persistWindowStateNow(app, avatarWindow, chatWindow, canvasWindow) {
  writeJsonFile(getAppFilePath(app, 'window-state.json'), {
    avatar: serializeWindowState(avatarWindow),
    chat: serializeWindowState(chatWindow),
    canvas: serializeWindowState(canvasWindow),
  });
}

function schedulePersistWindowState(app, avatarWindow, chatWindow, canvasWindow) {
  if (persistWindowStateTimer) clearTimeout(persistWindowStateTimer);
  persistWindowStateTimer = setTimeout(() => {
    persistWindowStateTimer = null;
    try { persistWindowStateNow(app, avatarWindow, chatWindow, canvasWindow); } catch { /* ignore */ }
  }, PERSIST_WINDOW_STATE_DEBOUNCE_MS);
}

/**
 * Bind persistent bounds events to a window.
 */
function bindPersistentBounds(app, targetWindow, avatarWindow, chatWindow, canvasWindow) {
  targetWindow.on('move', () => schedulePersistWindowState(app, avatarWindow, chatWindow, canvasWindow));
  targetWindow.on('resize', () => schedulePersistWindowState(app, avatarWindow, chatWindow, canvasWindow));
}

/**
 * Apply always-on-top to a window.
 */
function applyAlwaysOnTop(targetWindow, target, enabled) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  if (target === 'avatar') {
    targetWindow.setAlwaysOnTop(Boolean(enabled), WINDOW_ALWAYS_ON_TOP_LEVEL_SCREEN_SAVER, WINDOW_ALWAYS_ON_TOP_Z_ORDER);
    targetWindow.setVisibleOnAllWorkspaces(Boolean(enabled));
    return;
  }
  targetWindow.setAlwaysOnTop(Boolean(enabled), WINDOW_ALWAYS_ON_TOP_LEVEL_FLOATING, WINDOW_ALWAYS_ON_TOP_Z_ORDER);
}

/**
 * Normalize canvas layout alias.
 */
function normalizeCanvasLayout(layout) {
  const value = String(layout || '').trim().toLowerCase();
  const aliasMap = { right: 'right-docked', docked: 'right-docked', 'right-docked': 'right-docked', split: 'split-50', 'split-50': 'split-50', half: 'split-50' };
  return aliasMap[value] || 'right-docked';
}

/**
 * Get canvas bounds for a given layout.
 */
function getCanvasBoundsForLayout(layout, avatarBounds) {
  const avatar = avatarBounds;
  const workArea = getDisplayById(screen.getDisplayMatching(avatar).id).workArea;
  const gap = WINDOW_CANVAS_GAP;

  if (layout === 'split-50') {
    const halfWidth = Math.max(WINDOW_SPLIT_MIN_HALF, Math.floor(workArea.width / 2));
    return {
      avatar: { x: workArea.x, y: workArea.y, width: halfWidth, height: workArea.height },
      canvas: { x: workArea.x + halfWidth, y: workArea.y, width: Math.max(WINDOW_SPLIT_MIN_HALF, workArea.width - halfWidth), height: workArea.height },
    };
  }

  const preferredWidth = Math.min(DEFAULT_CANVAS_WIDTH, Math.max(420, Math.floor(workArea.width * WINDOW_CANVAS_WIDTH_RATIO)));
  let x = avatar.x + avatar.width + gap;
  let width = preferredWidth;
  if (x + width > workArea.x + workArea.width - gap) {
    width = Math.max(420, Math.floor(workArea.width * 0.32));
    x = workArea.x + workArea.width - width - gap;
  }

  return { avatar, canvas: { x, y: Math.max(workArea.y + gap, avatar.y), width, height: Math.min(workArea.height - gap * 2, avatar.height) } };
}

/**
 * Load renderer window with dev/prod URL.
 */
function loadRendererWindow(targetWindow, screenName) {
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  const loadPromise = isDev
    ? targetWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?screen=${encodeURIComponent(screenName)}`)
    : targetWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { screen: screenName } });
  void Promise.resolve(loadPromise).catch((error) => {
    console.error(`[loadRendererWindow:${screenName}]`, error);
  });
}

/**
 * Create the avatar window.
 */
function createAvatarWindow(app, options = {}) {
  const config = getStoredWindowConfig(app, 'avatar', true);
  const { onStatusBroadcast, onCanvasSync } = options;

  const avatarWindow = new BrowserWindow({
    x: config.bounds.x, y: config.bounds.y, width: config.bounds.width, height: config.bounds.height,
    minWidth: WINDOW_MIN_AVATAR_WIDTH, minHeight: WINDOW_MIN_AVATAR_HEIGHT,
    show: false, frame: false, transparent: true, hasShadow: false, title: 'Avatar ACP',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, nodeIntegration: false, webviewTag: true },
  });

  applyAlwaysOnTop(avatarWindow, 'avatar', config.alwaysOnTop);
  avatarWindow.setFullScreenable(false);
  avatarWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  avatarWindow.webContents.on('will-attach-webview', (_event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    params.allowpopups = 'false';
  });

  avatarWindow.once('ready-to-show', () => { avatarWindow.show(); onStatusBroadcast?.(); });

  const statusLoop = createRendererLoop({
    window: avatarWindow, interval: RENDERER_LOOP_INTERVAL_MS,
    run: () => {
      if (avatarWindow && !isRendererUnavailable(avatarWindow)) {
        avatarWindow.webContents.send('avatar-status', options.getStatePayload?.());
      }
    },
  });

  bindPersistentBounds(app, avatarWindow, avatarWindow, options.chatWindow, options.canvasWindow);
  avatarWindow.on('move', () => onCanvasSync?.());
  avatarWindow.on('resize', () => onCanvasSync?.());
  avatarWindow.on('closed', () => { statusLoop?.stop(); });

  loadRendererWindow(avatarWindow, 'avatar');
  return { window: avatarWindow, statusLoop };
}

/**
 * Create the chat window.
 */
function createChatWindow(app, options = {}) {
  const config = getStoredWindowConfig(app, 'chat', true);

  const chatWindow = new BrowserWindow({
    x: config.bounds.x, y: config.bounds.y, width: config.bounds.width, height: config.bounds.height,
    minWidth: 380, minHeight: 640, show: false, frame: true, transparent: false, hasShadow: true,
    title: 'Avatar ACP Chat', backgroundColor: '#0c111c',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, nodeIntegration: false, webviewTag: false },
  });

  applyAlwaysOnTop(chatWindow, 'chat', config.alwaysOnTop);
  chatWindow.setFullScreenable(false);
  chatWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  chatWindow.once('ready-to-show', () => { chatWindow.show(); options.onStatusBroadcast?.(); });

  const statusLoop = createRendererLoop({
    window: chatWindow, interval: RENDERER_LOOP_INTERVAL_MS,
    run: () => {
      if (chatWindow && !isRendererUnavailable(chatWindow)) {
        chatWindow.webContents.send('avatar-status', options.getStatePayload?.());
      }
    },
  });

  bindPersistentBounds(app, chatWindow, options.avatarWindow, chatWindow, options.canvasWindow);
  chatWindow.on('closed', () => { statusLoop?.stop(); });

  loadRendererWindow(chatWindow, 'chat');
  return { window: chatWindow, statusLoop };
}

/**
 * Create the canvas window.
 */
function createCanvasWindow(app, options = {}) {
  const config = getStoredWindowConfig(app, 'canvas', false);

  const canvasWindow = new BrowserWindow({
    x: config.bounds.x, y: config.bounds.y, width: config.bounds.width, height: config.bounds.height,
    minWidth: 380, minHeight: 480, show: false, frame: true, transparent: false, hasShadow: true,
    title: 'Nyx Canvas', backgroundColor: '#0b1118',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, nodeIntegration: false, webviewTag: false },
  });

  applyAlwaysOnTop(canvasWindow, 'canvas', config.alwaysOnTop);
  canvasWindow.setFullScreenable(false);
  canvasWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  canvasWindow.once('ready-to-show', () => {
    if (options.canvasState?.isOpen) canvasWindow.show();
    if (canvasWindow && !isRendererUnavailable(canvasWindow)) {
      canvasWindow.webContents.send('canvas-state', options.canvasState);
    }
    options.onStatusBroadcast?.();
  });

  const statusLoop = createRendererLoop({
    window: canvasWindow, interval: RENDERER_LOOP_INTERVAL_MS,
    run: () => {
      if (canvasWindow && !isRendererUnavailable(canvasWindow)) {
        canvasWindow.webContents.send('avatar-status', options.getStatePayload?.());
        canvasWindow.webContents.send('canvas-state', options.canvasState);
      }
    },
  });

  bindPersistentBounds(app, canvasWindow, options.avatarWindow, options.chatWindow, canvasWindow);
  canvasWindow.on('closed', () => {
    if (options.canvasState?.layout === 'split-50' && options.canvasState?.lastAvatarBoundsBeforeSplit && options.avatarWindow && !options.avatarWindow.isDestroyed()) {
      options.avatarWindow.setBounds(options.canvasState.lastAvatarBoundsBeforeSplit);
    }
    statusLoop?.stop();
    if (options.canvasState) {
      options.canvasState.isOpen = false;
      options.canvasState.lastAvatarBoundsBeforeSplit = null;
    }
  });

  loadRendererWindow(canvasWindow, 'canvas');
  return { window: canvasWindow, statusLoop };
}

/**
 * Sync canvas window position to avatar window.
 */
function syncCanvasToAvatar(canvasWindow, avatarWindow, canvasState) {
  if (!canvasWindow || canvasWindow.isDestroyed()) return;
  if (!avatarWindow || avatarWindow.isDestroyed()) return;
  if (!canvasState.isOpen) return;

  const normalizedLayout = normalizeCanvasLayout(canvasState.layout);
  const nextBounds = getCanvasBoundsForLayout(normalizedLayout, avatarWindow.getBounds());

  if (normalizedLayout === 'split-50') {
    avatarWindow.setBounds(nextBounds.avatar);
  } else if (canvasState.lastAvatarBoundsBeforeSplit && avatarWindow && !avatarWindow.isDestroyed()) {
    canvasState.lastAvatarBoundsBeforeSplit = null;
  }

  canvasWindow.setBounds(nextBounds.canvas);
}

/**
 * Open canvas window.
 */
async function openCanvas(app, canvasWindow, avatarWindow, canvasState, options = {}) {
  if (!ENABLE_LIVE_CANVAS) {
    canvasState.isOpen = false;
    canvasState.lastAvatarBoundsBeforeSplit = null;
    if (canvasWindow && !canvasWindow.isDestroyed()) canvasWindow.hide();
    return { ok: true, disabled: true, state: canvasState };
  }

  const layout = normalizeCanvasLayout(options.layout || canvasState.layout);
  const wasOpen = canvasState.isOpen;

  if (!canvasWindow || canvasWindow.isDestroyed()) {
    const created = createCanvasWindow(app, { ...options, canvasState });
    canvasWindow = created.window;
  }

  if (canvasState.layout === 'split-50' && layout !== 'split-50' && canvasState.lastAvatarBoundsBeforeSplit && avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.setBounds(canvasState.lastAvatarBoundsBeforeSplit);
    canvasState.lastAvatarBoundsBeforeSplit = null;
  }

  if (layout === 'split-50' && avatarWindow && !avatarWindow.isDestroyed() && !canvasState.lastAvatarBoundsBeforeSplit) {
    canvasState.lastAvatarBoundsBeforeSplit = avatarWindow.getBounds();
  }

  canvasState.isOpen = true;
  canvasState.layout = layout;
  canvasState.lastAvatarBoundsBeforeSplit = canvasState.lastAvatarBoundsBeforeSplit;

  syncCanvasToAvatar(canvasWindow, avatarWindow, canvasState);
  applyAlwaysOnTop(canvasWindow, 'canvas', options.getCurrentWindowPrefs?.().canvasAlwaysOnTop ?? false);

  if (!wasOpen) canvasWindow.show();
  else canvasWindow.showInactive();
  canvasWindow.focus();

  return { ok: true, state: canvasState };
}

/**
 * Close canvas window.
 */
function closeCanvas(canvasWindow, avatarWindow, canvasState) {
  if (canvasState.layout === 'split-50' && canvasState.lastAvatarBoundsBeforeSplit && avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.setBounds(canvasState.lastAvatarBoundsBeforeSplit);
  }
  canvasState.isOpen = false;
  canvasState.lastAvatarBoundsBeforeSplit = null;
  if (canvasWindow && !canvasWindow.isDestroyed()) canvasWindow.hide();
  return { ok: true, state: canvasState };
}

/**
 * Set window always-on-top.
 */
function setWindowAlwaysOnTop(target, enabled, avatarWindow, chatWindow, canvasWindow, onBroadcast) {
  if (target === 'avatar') applyAlwaysOnTop(avatarWindow, target, enabled);
  if (target === 'chat') applyAlwaysOnTop(chatWindow, target, enabled);
  if (target === 'canvas') applyAlwaysOnTop(canvasWindow, target, enabled);
  onBroadcast?.();
  return { ok: true };
}

/**
 * Get current window prefs.
 */
function getCurrentWindowPrefs(avatarWindow, chatWindow, canvasWindow, storedState) {
  const state = storedState || {};
  return {
    avatarAlwaysOnTop: avatarWindow && !avatarWindow.isDestroyed() ? avatarWindow.isAlwaysOnTop() : state.avatar?.alwaysOnTop ?? true,
    chatAlwaysOnTop: chatWindow && !chatWindow.isDestroyed() ? chatWindow.isAlwaysOnTop() : state.chat?.alwaysOnTop ?? true,
    canvasAlwaysOnTop: canvasWindow && !canvasWindow.isDestroyed() ? canvasWindow.isAlwaysOnTop() : state.canvas?.alwaysOnTop ?? false,
  };
}

module.exports = {
  getDisplayById,
  isBoundsVisible,
  getWindowLayout,
  getStoredWindowConfig,
  serializeWindowState,
  persistWindowStateNow,
  schedulePersistWindowState,
  bindPersistentBounds,
  applyAlwaysOnTop,
  normalizeCanvasLayout,
  getCanvasBoundsForLayout,
  loadRendererWindow,
  createAvatarWindow,
  createChatWindow,
  createCanvasWindow,
  syncCanvasToAvatar,
  openCanvas,
  closeCanvas,
  setWindowAlwaysOnTop,
  getCurrentWindowPrefs,
};
