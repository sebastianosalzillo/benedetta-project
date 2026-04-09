/**
 * Avatar Window Bridge — preload for the avatar renderer window.
 *
 * Kept intentionally minimal to avoid syntax/parsing issues in sandbox mode.
 * The page-side command handler (avatar-page-handler.js) is injected by
 * window-manager.js via webContents.executeJavaScript() on did-finish-load.
 *
 * app.enableSandbox() forces contextIsolation: true on every renderer, so
 * this preload runs in an ISOLATED JS world and CANNOT access window.head.
 *
 * What this file does:
 *  1. Early transparency — CSS applied before the page paints.
 *  2. contextBridge exposes __nyxBridge.notifyPlayback() to the PAGE world.
 *  3. IPC → CustomEvent relay (CustomEvents cross the isolation boundary).
 */

const { ipcRenderer, contextBridge } = require('electron');

// ══════════════════════════════════════════════════════════════════════════════
// 1. FORCE TRANSPARENCY — applied early before any page paint
// ══════════════════════════════════════════════════════════════════════════════

const de = document.documentElement;
if (de && de.style) {
  de.style.setProperty('background', 'transparent', 'important');
  de.style.setProperty('background-color', 'transparent', 'important');
}

const earlyStyle = document.createElement('style');
earlyStyle.id = 'nyx-early-transparency';
earlyStyle.textContent = [
  ':root { background: transparent !important; background-color: transparent !important; }',
  'html { background: transparent !important; background-color: transparent !important; }',
  'body { background: transparent !important; background-color: transparent !important; overflow: hidden !important; }',
  '#view { background: transparent !important; }',
  '#avatar { background: transparent !important; }',
  '#main { background: transparent !important; }',
  'canvas { background: transparent !important; }',
  ':root, .theme-dark { --colorBackground: transparent !important; }',
].join('\n');

function insertEarlyStyle() {
  if (earlyStyle.parentNode) return true;
  if (document.head && typeof document.head.insertBefore === 'function') {
    document.head.insertBefore(earlyStyle, document.head.firstChild || null);
    return true;
  }

  const root = document.documentElement || document.body;
  if (root && typeof root.insertBefore === 'function') {
    root.insertBefore(earlyStyle, root.firstChild || null);
    return true;
  }

  return false;
}

function applyBodyTransparency() {
  if (!document.body || !document.body.style) return false;
  document.body.style.setProperty('background', 'transparent', 'important');
  return true;
}

const hasEarlyStyle = insertEarlyStyle();
const hasTransparentBody = applyBodyTransparency();

if ((!hasEarlyStyle || !hasTransparentBody) && typeof MutationObserver === 'function') {
  const obs = new MutationObserver(() => {
    const styleReady = insertEarlyStyle();
    const bodyReady = applyBodyTransparency();
    if (styleReady && bodyReady) obs.disconnect();
  });
  obs.observe(document, { childList: true, subtree: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. CONTEXT BRIDGE — exposes notifyPlayback() to the PAGE world so the
//    page-side handler (injected via executeJavaScript) can send playback
//    events back to main.
// ══════════════════════════════════════════════════════════════════════════════

contextBridge.exposeInMainWorld('__nyxBridge', {
  notifyPlayback: (payload) => {
    if (!payload || !payload.requestId || !payload.segmentId) return;
    ipcRenderer.send('avatar:playback', payload);
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. IPC → CustomEvent relay
//    CustomEvents dispatched from the preload world ARE received by listeners
//    in the page world — intentional Electron isolation-crossing behaviour.
// ══════════════════════════════════════════════════════════════════════════════

ipcRenderer.on('avatar-command', (_event, data) => {
  window.dispatchEvent(new CustomEvent('__nyx_cmd__', { detail: data }));
});

ipcRenderer.on('avatar-status', (_event, data) => {
  window.dispatchEvent(new CustomEvent('__nyx_cmd__', {
    detail: { cmd: 'status', text: data && (data.status || data.text) || '' },
  }));
});
