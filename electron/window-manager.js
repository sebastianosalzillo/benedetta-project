const path = require('path');
const fs = require('fs');
const { BrowserWindow, screen } = require('electron');
const {
  createNavigationGuard,
} = require('./security');
const {
  DEFAULT_CHAT_WIDTH,
  DEFAULT_CANVAS_WIDTH,
  WINDOW_GAP,
  WINDOW_CANVAS_GAP,
  WINDOW_MIN_AVATAR_WIDTH,
  WINDOW_MIN_AVATAR_HEIGHT,
  WINDOW_MIN_CHAT_WIDTH,
  WINDOW_MIN_CHAT_HEIGHT,
  WINDOW_MIN_CANVAS_WIDTH,
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
  PERSIST_WINDOW_STATE_DEBOUNCE_MS,
  RENDERER_LOOP_INTERVAL_MS,
  ENABLE_LIVE_CANVAS,
} = require('./constants');
const { createRendererLoop, isRendererUnavailable } = require('./renderer-loop');

/**
 * Read/write JSON file helpers.
 */
/**
 * Read a JSON file with fallback on parse/read failure.
 *
 * @param {string} filePath
 * @param {any} fallback
 * @returns {any}
 */
function readJsonFile(filePath, fallback) {
  const fs = require('fs');
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

/**
 * Write a JSON-serializable value to disk.
 *
 * @param {string} filePath
 * @param {any} value
 * @returns {void}
 */
function writeJsonFile(filePath, value) {
  const fs = require('fs');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

/**
 * Get a display by ID or fall back to the primary display.
 *
 * @param {number|string} displayId
 * @returns {Electron.Display}
 */
function getDisplayById(displayId) {
  return screen.getAllDisplays().find((d) => d.id === displayId) || screen.getPrimaryDisplay();
}

/**
 * Check whether bounds intersect any display work area.
 *
 * @param {{ x: number, y: number, width: number, height: number } | null} bounds
 * @returns {boolean}
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
 * Calculate default avatar/chat/canvas layout for a display.
 *
 * @param {number|string} displayId
 * @returns {{ avatar: Object, chat: Object, canvas: Object }}
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
 * Read stored window config and fall back to computed defaults when needed.
 *
 * @param {Object} app
 * @param {'avatar'|'chat'|'canvas'} key
 * @param {boolean} defaultAlwaysOnTop
 * @returns {{ bounds: Object, displayId: number|string, alwaysOnTop: boolean }}
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
 * Serialize a window for persistence.
 *
 * @param {BrowserWindow|null} targetWindow
 * @returns {Object|undefined}
 */
function serializeWindowState(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return undefined;
  const bounds = targetWindow.getBounds();
  const displayId = screen.getDisplayMatching(bounds).id;
  return { bounds, displayId, alwaysOnTop: targetWindow.isAlwaysOnTop() };
}

/**
 * Resolve an app-scoped state file path.
 *
 * @param {Object} app
 * @param {string} name
 * @returns {string}
 */
function getAppFilePath(app, name) {
  return path.join(app.getPath('userData'), name);
}

/**
 * Persist window state with debouncing.
 */
let persistWindowStateTimer = null;

/**
 * Window registry — centralizes window references.
 * Set by main.js after each createXxxWindow call.
 */
let _avatarWindow = null;
let _chatWindow = null;
let _canvasWindow = null;

/**
 * Get the avatar window instance.
 * @returns {BrowserWindow|null} The avatar window or null
 */
function getAvatarWindow() { return _avatarWindow; }
/**
 * Set the avatar window instance.
 * @param {BrowserWindow|null} win - The window instance
 */
function setAvatarWindow(win) { _avatarWindow = win; }
function getChatWindow() { return _chatWindow; }
function setChatWindow(win) { _chatWindow = win; }
function getCanvasWindow() { return _canvasWindow; }
function setCanvasWindow(win) { _canvasWindow = win; }
function getWindows() { return { avatar: _avatarWindow, chat: _chatWindow, canvas: _canvasWindow }; }

/**
 * Resolve explicit window refs, falling back to the live registry when omitted.
 *
 * @param {BrowserWindow|null|undefined} avatarWindow
 * @param {BrowserWindow|null|undefined} chatWindow
 * @param {BrowserWindow|null|undefined} canvasWindow
 * @returns {{ avatarWindow: BrowserWindow|null, chatWindow: BrowserWindow|null, canvasWindow: BrowserWindow|null }}
 */
function resolveWindowRefs(avatarWindow, chatWindow, canvasWindow) {
  return {
    avatarWindow: avatarWindow === undefined ? getAvatarWindow() : avatarWindow,
    chatWindow: chatWindow === undefined ? getChatWindow() : chatWindow,
    canvasWindow: canvasWindow === undefined ? getCanvasWindow() : canvasWindow,
  };
}

/**
 * Persist current window state to disk.
 *
 * @param {Object} app
 * @param {BrowserWindow|null} [avatarWindow]
 * @param {BrowserWindow|null} [chatWindow]
 * @param {BrowserWindow|null} [canvasWindow]
 * @returns {void}
 */
function persistWindowStateNow(app, avatarWindow, chatWindow, canvasWindow) {
  const refs = resolveWindowRefs(avatarWindow, chatWindow, canvasWindow);
  writeJsonFile(getAppFilePath(app, 'window-state.json'), {
    avatar: serializeWindowState(refs.avatarWindow),
    chat: serializeWindowState(refs.chatWindow),
    canvas: serializeWindowState(refs.canvasWindow),
  });
}

/**
 * Debounce persistence of window state.
 *
 * @param {Object} app
 * @param {BrowserWindow|null} [avatarWindow]
 * @param {BrowserWindow|null} [chatWindow]
 * @param {BrowserWindow|null} [canvasWindow]
 * @returns {void}
 */
function schedulePersistWindowState(app, avatarWindow, chatWindow, canvasWindow) {
  if (persistWindowStateTimer) clearTimeout(persistWindowStateTimer);
  persistWindowStateTimer = setTimeout(() => {
    persistWindowStateTimer = null;
    try { persistWindowStateNow(app, avatarWindow, chatWindow, canvasWindow); } catch { /* ignore */ }
  }, PERSIST_WINDOW_STATE_DEBOUNCE_MS);
}

/**
 * Bind move/resize listeners that persist window state.
 *
 * @param {Object} app
 * @param {BrowserWindow} targetWindow
 * @returns {void}
 */
function bindPersistentBounds(app, targetWindow) {
  targetWindow.on('move', () => schedulePersistWindowState(app));
  targetWindow.on('resize', () => schedulePersistWindowState(app));
}

/**
 * Apply the project-specific always-on-top policy to a window.
 *
 * @param {BrowserWindow|null} targetWindow
 * @param {'avatar'|'chat'|'canvas'} target
 * @param {boolean} enabled
 * @returns {void}
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
 * Normalize supported canvas layout aliases.
 *
 * @param {string} layout
 * @returns {string}
 */
function normalizeCanvasLayout(layout) {
  const value = String(layout || '').trim().toLowerCase();
  const aliasMap = { right: 'right-docked', docked: 'right-docked', 'right-docked': 'right-docked', split: 'split-50', 'split-50': 'split-50', half: 'split-50' };
  return aliasMap[value] || 'right-docked';
}

/**
 * Compute next avatar/canvas bounds for a layout.
 *
 * @param {string} layout
 * @param {{ x: number, y: number, width: number, height: number }} avatarBounds
 * @returns {{ avatar: Object, canvas: Object }}
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
 * Load a renderer window in dev or production mode.
 *
 * @param {BrowserWindow} targetWindow
 * @param {string} screenName
 * @returns {void}
 */
function loadRendererWindow(targetWindow, screenName) {
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  const loadPromise = isDev
    ? targetWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?screen=${encodeURIComponent(screenName)}`)
    : targetWindow.loadURL(`app://app/index.html?screen=${encodeURIComponent(screenName)}`);
  void Promise.resolve(loadPromise).catch((error) => {
    console.error(`[loadRendererWindow:${screenName}]`, error);
  });
}

/**
 * Load the avatar renderer window — talkinghead directly, no React/webview.
 *
 * @param {BrowserWindow} targetWindow
 * @returns {void}
 */
function loadAvatarRenderer(targetWindow, retryCount = 0) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  const url = isDev
    ? `${process.env.VITE_DEV_SERVER_URL.replace(/\/?$/, '/')}talkinghead/index.html`
    : `app://app/talkinghead/index.html`;

  targetWindow.loadURL(url).catch((error) => {
    console.error(`[loadAvatarRenderer] attempt ${retryCount + 1}:`, error.code || error.message);
    if (retryCount < 3 && !targetWindow.isDestroyed()) {
      setTimeout(() => loadAvatarRenderer(targetWindow, retryCount + 1), 2000);
    }
  });
}

/**
 * Create the avatar window.
 *
 * The avatar runtime (talkinghead) loads directly in this BrowserWindow.
 * No <webview> tag is used — the bridge script is preloaded and sets up
 * IPC listeners for avatar commands.
 *
 * @param {Object} app - Electron app instance
 * @param {Object} options - Creation options
 * @param {Function} options.onStatusBroadcast - Callback for status broadcast
 * @param {Function} options.onCanvasSync - Callback for canvas sync
 * @param {Function} [options.getStatePayload] - Lazy getter for renderer status payload
 * @returns {Object} - { window, statusLoop }
 */
function createAvatarWindow(app, options = {}) {
  const config = getStoredWindowConfig(app, 'avatar', true);
  const { onStatusBroadcast, onCanvasSync } = options;

  const avatarWindow = new BrowserWindow({
    x: config.bounds.x, y: config.bounds.y, width: config.bounds.width, height: config.bounds.height,
    minWidth: WINDOW_MIN_AVATAR_WIDTH, minHeight: WINDOW_MIN_AVATAR_HEIGHT,
    show: false, frame: false, transparent: true, hasShadow: false, title: 'Avatar ACP',
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'avatar-window-bridge.js'), contextIsolation: true, sandbox: false, nodeIntegration: false, webviewTag: false },
  });

  // Ensure webContents background is transparent so the window stays transparent.
  avatarWindow.setBackgroundColor('#00000000');

  applyAlwaysOnTop(avatarWindow, 'avatar', config.alwaysOnTop);
  avatarWindow.setFullScreenable(false);
  avatarWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  avatarWindow.webContents.on('will-navigate', createNavigationGuard());

  // On every load: force transparency + hide chrome + ensure avatar is visible.
  // insertCSS bypasses CSP and contextIsolation completely.
  // executeJavaScript runs in the page world and can access window.head directly.
  const pageHandlerCode = (() => {
    try {
      return fs.readFileSync(path.join(__dirname, 'avatar-page-handler.js'), 'utf8');
    } catch (e) {
      console.error('[window-manager] failed to read avatar-page-handler.js', e);
      return '';
    }
  })();

  avatarWindow.webContents.on('did-finish-load', () => {
    avatarWindow.webContents.insertCSS([
      ':root, html, body, #main, #left, #view, #avatar, canvas {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '}',
      ':root, .theme-dark { --colorBackground: transparent !important; }',
      '#controls, .controls, nav, header, footer, .sidebar, .panel,',
      '.toolbar, .menu, .modal, .popup, .overlay, .card, .toast,',
      '#ui-toggle, #right, #bottom { display: none !important; }',
      '#loading { visibility: hidden !important; }',
      '#main, #left {',
      '  position: fixed !important; top: 0 !important; left: 0 !important;',
      '  width: 100% !important; height: 100% !important; margin: 0 !important;',
      '}',
      // Guarantee avatar is visible even if talkinghead's JS never calls reconnectEffect
      '#avatar, #view { opacity: 1 !important; }',
    ].join('\n')).catch(() => {});

    // Inject the page-side command handler into the page's JS world.
    // This must run early so it's ready to receive commands.
    if (pageHandlerCode && !avatarWindow.isDestroyed()) {
      avatarWindow.webContents.executeJavaScript(pageHandlerCode).catch(() => {});
    }

    // After talkinghead has had time to create window.head and load the avatar,
    // force the avatar visible and apply camera layout.
    setTimeout(() => {
      if (avatarWindow.isDestroyed()) return;
      avatarWindow.webContents.executeJavaScript(`
        (function() {
          var av = document.getElementById('avatar');
          var vw = document.getElementById('view');
          if (av) av.style.opacity = '1';
          if (vw) vw.style.opacity = '1';
          var h = window.head;
          if (!h) return;
          try {
            if (!h.armature && window.site && window.site.avatars) {
              var first = Object.values(window.site.avatars)[0];
              h.showAvatar(first).catch(function(){});
            }
          } catch(e) {}
          try {
            if (h.camera && h.controls && h.armature && h.armature.scale) {
              h.armature.scale.setScalar(0.8);
              var dist = 13.6, height = 0.92;
              h.camera.position.set(0, height, dist);
              if (h.controls.target && h.controls.target.set) h.controls.target.set(0, height, 0);
              if (h.controls.update) h.controls.update();
              h.controls.enabled = false;
            }
          } catch(e) {}
        })();
      `).catch(() => {});
    }, 4000);
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

  bindPersistentBounds(app, avatarWindow);
  avatarWindow.on('move', () => onCanvasSync?.());
  avatarWindow.on('resize', () => onCanvasSync?.());
  avatarWindow.on('closed', () => { statusLoop?.stop(); });

  loadAvatarRenderer(avatarWindow);
  return { window: avatarWindow, statusLoop };
}

/**
 * Create the chat window.
 *
 * @param {Object} app
 * @param {Object} [options]
 * @param {Function} [options.onStatusBroadcast]
 * @param {Function} [options.getStatePayload]
 * @returns {{ window: BrowserWindow, statusLoop: Object }}
 */
function createChatWindow(app, options = {}) {
  const config = getStoredWindowConfig(app, 'chat', true);

  const chatWindow = new BrowserWindow({
    x: config.bounds.x, y: config.bounds.y, width: config.bounds.width, height: config.bounds.height,
    minWidth: WINDOW_MIN_CHAT_WIDTH, minHeight: WINDOW_MIN_CHAT_HEIGHT, show: false, frame: true, transparent: false, hasShadow: true,
    title: 'Avatar ACP Chat', backgroundColor: '#0c111c',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false },
  });

  applyAlwaysOnTop(chatWindow, 'chat', config.alwaysOnTop);
  chatWindow.setFullScreenable(false);
  chatWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  chatWindow.webContents.on('will-navigate', createNavigationGuard());
  chatWindow.once('ready-to-show', () => { chatWindow.show(); options.onStatusBroadcast?.(); });

  const statusLoop = createRendererLoop({
    window: chatWindow, interval: RENDERER_LOOP_INTERVAL_MS,
    run: () => {
      if (chatWindow && !isRendererUnavailable(chatWindow)) {
        chatWindow.webContents.send('avatar-status', options.getStatePayload?.());
      }
    },
  });

  bindPersistentBounds(app, chatWindow);
  chatWindow.on('closed', () => { statusLoop?.stop(); });

  loadRendererWindow(chatWindow, 'chat');
  return { window: chatWindow, statusLoop };
}

/**
 * Create the canvas window.
 *
 * @param {Object} app
 * @param {Object} [options]
 * @param {Object} [options.canvasState]
 * @param {BrowserWindow|null} [options.avatarWindow]
 * @param {Function} [options.onStatusBroadcast]
 * @param {Function} [options.getStatePayload]
 * @returns {{ window: BrowserWindow, statusLoop: Object }}
 */
function createCanvasWindow(app, options = {}) {
  const config = getStoredWindowConfig(app, 'canvas', false);

  const canvasWindow = new BrowserWindow({
    x: config.bounds.x, y: config.bounds.y, width: config.bounds.width, height: config.bounds.height,
    minWidth: WINDOW_MIN_CANVAS_WIDTH, minHeight: WINDOW_MIN_CANVAS_HEIGHT, show: false, frame: true, transparent: false, hasShadow: true,
    title: 'Nyx Canvas', backgroundColor: '#0b1118',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false },
  });

  applyAlwaysOnTop(canvasWindow, 'canvas', config.alwaysOnTop);
  canvasWindow.setFullScreenable(false);
  canvasWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  canvasWindow.webContents.on('will-navigate', createNavigationGuard());
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

  bindPersistentBounds(app, canvasWindow);
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
 * Sync canvas bounds to the avatar window according to current layout.
 *
 * @param {BrowserWindow|null} canvasWindow
 * @param {BrowserWindow|null} avatarWindow
 * @param {{ isOpen: boolean, layout: string, lastAvatarBoundsBeforeSplit?: Object|null }} canvasState
 * @returns {void}
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
 * Open or reveal the canvas window.
 *
 * @param {Object} app
 * @param {BrowserWindow|null} canvasWindow
 * @param {BrowserWindow|null} avatarWindow
 * @param {Object} canvasState
 * @param {Object} [options]
 * @returns {Promise<Object>}
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
 * Close or hide the canvas window and restore avatar bounds if needed.
 *
 * @param {BrowserWindow|null} canvasWindow
 * @param {BrowserWindow|null} avatarWindow
 * @param {Object} canvasState
 * @returns {Object}
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
 * Set always-on-top for one of the managed windows.
 *
 * @param {'avatar'|'chat'|'canvas'} target
 * @param {boolean} enabled
 * @param {BrowserWindow|null} avatarWindow
 * @param {BrowserWindow|null} chatWindow
 * @param {BrowserWindow|null} canvasWindow
 * @param {Function} [onBroadcast]
 * @returns {{ ok: boolean }}
 */
function setWindowAlwaysOnTop(target, enabled, avatarWindow, chatWindow, canvasWindow, onBroadcast) {
  if (target === 'avatar') applyAlwaysOnTop(avatarWindow, target, enabled);
  if (target === 'chat') applyAlwaysOnTop(chatWindow, target, enabled);
  if (target === 'canvas') applyAlwaysOnTop(canvasWindow, target, enabled);
  onBroadcast?.();
  return { ok: true };
}

/**
 * Get current window preferences (always on top settings).
 * @param {BrowserWindow|null} avatarWindow - Avatar window
 * @param {BrowserWindow|null} chatWindow - Chat window
 * @param {BrowserWindow|null} canvasWindow - Canvas window
 * @param {Object} storedState - Stored state object
 * @returns {Object} Window preferences
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
  loadAvatarRenderer,
  createAvatarWindow,
  createChatWindow,
  createCanvasWindow,
  syncCanvasToAvatar,
  openCanvas,
  closeCanvas,
  setWindowAlwaysOnTop,
  getCurrentWindowPrefs,
  getAvatarWindow,
  setAvatarWindow,
  getChatWindow,
  setChatWindow,
  getCanvasWindow,
  setCanvasWindow,
  getWindows,
};
