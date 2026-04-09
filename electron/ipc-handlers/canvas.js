/**
 * @fileoverview Canvas IPC handlers — extracted from main.js.
 *
 * Factory function that returns IPC handler functions.
 * The handlers are NOT registered with ipcMain here — the caller must wire them up.
 * This keeps the module testable and free of Electron imports.
 *
 * Usage in main.js:
 * ```js
 * const { createCanvasHandlers } = require('./ipc-handlers/canvas');
 * const handlers = createCanvasHandlers({ getCanvasManager, handleCanvasDirective, openCanvas, closeCanvas, refreshBrowserCanvas, navigateBrowserCanvas, performBrowserAction });
 *
 * // Then in ready():
 * registerValidatedIpcHandler(ipcMain, 'canvas:get-state', handlers.getState);
 * registerValidatedIpcHandler(ipcMain, 'canvas:open', handlers.open);
 * // etc.
 * ```
 *
 * @module ipc-handlers/canvas
 */

/**
 * Dependencies needed to create handlers.
 * @typedef {Object} CanvasHandlerDeps
 * @property {function(): Object} getCanvasState - Get current canvas state
 * @property {function(Object): Object} handleCanvasDirective - Handle canvas open/update directive
 * @property {function(Object): Promise<{ok: boolean, state: Object, error: string|null}>} openCanvas - Open canvas with options
 * @property {function(): Object} closeCanvas - Close canvas
 * @property {function(Object, Object): Promise<{ok: boolean, state: Object, error: string|null}>} refreshBrowserCanvas - Refresh browser content
 * @property {function(Object): Promise<{ok: boolean, state: Object, error: string|null}>} navigateBrowserCanvas - Navigate browser
 * @property {function(Object, Object, Function): Promise<Object>} performBrowserAction - Perform browser action via browser-agent
 */

/**
 * Create canvas IPC handlers.
 * @param {CanvasHandlerDeps} deps
 * @returns {Object} Map of handler functions ready for ipcMain registration
 */
function createCanvasHandlers(deps) {
  return {
    /**
     * canvas:get-state — return current canvas state.
     * Refreshes browser content if type is 'browser'.
     */
    getState: async () => {
      try {
        const state = deps.getCanvasState();

        // If browser content, refresh content without navigating
        if (state?.content?.type === 'browser') {
          const refreshedContent = await deps.refreshBrowserCanvas(
            {},
            { browser: { navigate: false }, showCanvas: false }
          );
          if (refreshedContent.ok) {
            return { ok: true, state: refreshedContent.state };
          }
        }

        return { ok: true, state };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    /**
     * canvas:open — open canvas with content.
     */
    open: async (_event, payload) => {
      try {
        return await deps.handleCanvasDirective({ action: 'open', ...(payload || {}) });
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    /**
     * canvas:update — update canvas content (alias for open).
     */
    update: async (_event, payload) => {
      try {
        return await deps.handleCanvasDirective({ action: 'open', ...(payload || {}) });
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    /**
     * canvas:close — close the canvas window.
     */
    close: async () => {
      try {
        return deps.closeCanvas();
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    /**
     * canvas:set-layout — change canvas layout (e.g., 'right-docked', 'split', 'fullscreen').
     */
    setLayout: async (_event, layout) => {
      try {
        const state = deps.getCanvasState();
        return await deps.openCanvas({
          layout,
          content: state.content,
          buildOptions: state.content?.type === 'browser'
            ? { browser: { navigate: false } }
            : {},
        });
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };
}

/**
 * Create browser IPC handlers.
 * @param {CanvasHandlerDeps} deps
 * @param {Object} canvasStateRef - Reference to canvas state object
 * @returns {Object} Map of handler functions
 */
function createBrowserHandlers(deps, canvasStateRef) {
  return {
    /**
     * browser:navigate — navigate browser canvas to URL.
     */
    navigate: async (_event, payload) => {
      try {
        return await deps.navigateBrowserCanvas({
          title: payload?.title || canvasStateRef.content?.title || 'Browser',
          url: payload?.url || payload?.value || payload?.query || canvasStateRef.content?.url || '',
        });
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    /**
     * browser:refresh — refresh browser canvas content.
     */
    refresh: async (_event, payload) => {
      try {
        return await deps.refreshBrowserCanvas(payload || {}, { navigate: false, showCanvas: false });
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    /**
     * browser:action — perform browser action (click, type, scroll, etc.).
     */
    action: async (_event, payload) => {
      try {
        return await deps.performBrowserAction(
          payload || {},
          canvasStateRef,
          deps.refreshBrowserCanvas
        );
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };
}

module.exports = {
  createCanvasHandlers,
  createBrowserHandlers,
};
