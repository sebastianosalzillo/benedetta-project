/**
 * @fileoverview Canvas state management — extracted from main.js.
 *
 * Manages the canvas window state: open/close, layout, content (browser, files, text, media),
 * persistence to disk, and browser canvas refresh/navigation.
 *
 * This module is SELF-CONTAINED — it does NOT import from main.js.
 * It receives dependencies (window manager, browser-agent, fs helpers) via injection.
 *
 * @module canvas-manager
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ============================================================
// Default state and paths
// ============================================================

/**
 * Create default canvas state.
 * @returns {{isOpen: boolean, layout: string, content: Object, lastAvatarBoundsBeforeSplit: null}}
 */
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

// ============================================================
// Content type inference and building
// ============================================================

/**
 * Infer canvas content type from file extension.
 * @param {string} filePath
 * @returns {string}
 */
function inferCanvasContentTypeFromPath(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov', '.mkv'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext)) return 'audio';
  if (['.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.xml', '.yml', '.yaml', '.log'].includes(ext)) return 'text';
  return 'file';
}

/**
 * Convert a file path to a file:// URL.
 * @param {string} filePath
 * @returns {string}
 */
function toFileHref(filePath) {
  try {
    return pathToFileURL(path.resolve(filePath)).href;
  } catch {
    return '';
  }
}

/**
 * Build canvas content from a raw content object.
 * Resolves browser content via browser-agent, reads files from disk,
 * infers types, and normalizes all fields.
 *
 * @param {Object} content - Raw content object
 * @param {Object} [options]
 * @param {Object} [options.browser] - Browser resolution options for browser-agent
 * @param {function(Object, Object): Promise<Object>} [options.resolveBrowserContent] - Browser content resolver (injected)
 * @returns {Promise<Object>} Normalized content object
 */
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

  // Resolve browser content via browser-agent
  if (normalized.type === 'browser') {
    const resolveFn = options.resolveBrowserContent;
    if (typeof resolveFn === 'function') {
      return resolveFn(normalized, options.browser || {});
    }
    // Fallback: return as-is if no resolver provided
    return normalized;
  }

  // Resolve file content from disk
  if (normalized.path) {
    try {
      const stats = await fs.promises.stat(normalized.path);
      if (stats.isDirectory()) {
        normalized.type = 'files';
        normalized.title = normalized.title || path.basename(normalized.path) || normalized.path;
        const entries = await fs.promises.readdir(normalized.path, { withFileTypes: true });
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
          normalized.value = await fs.promises.readFile(normalized.path, 'utf8').catch(() => normalized.path);
        }
      }
    } catch {
      normalized.type = normalized.type === 'empty' ? 'text' : normalized.type;
      normalized.value = normalized.value || `Path non accessibile: ${normalized.path}`;
    }
  }

  // Ensure media src is a file:// URL
  if (normalized.src && ['image', 'video', 'audio'].includes(normalized.type) && !/^https?:|^file:/i.test(normalized.src)) {
    normalized.src = toFileHref(path.resolve(normalized.src));
  }

  if (normalized.type === 'clipboard') {
    normalized.editable = true;
  }

  return normalized;
}

// ============================================================
// Content serialization for persistence
// ============================================================

/**
 * Serialize canvas content for JSON persistence.
 * Strips large fields (screenshotSrc, snapshotItems) to keep the file small.
 * @param {Object} content
 * @returns {Object}
 */
function serializeCanvasContentForPersistence(content) {
  if (!content) return content;
  return {
    ...content,
    // Strip large fields
    screenshotSrc: undefined,
    snapshotItems: undefined,
    entries: undefined,
    tabs: undefined,
    // Keep essential fields
    type: content.type,
    title: content.title,
    value: content.value,
    url: content.url,
    currentUrl: content.currentUrl,
    pageTitle: content.pageTitle,
    status: content.status,
    path: content.path,
    src: content.src,
    editable: content.editable,
  };
}

// ============================================================
// Canvas Manager class
// ============================================================

/**
 * CanvasManager — manages canvas state with persistence and browser integration.
 *
 * Usage:
 * ```js
 * const canvasManager = new CanvasManager({
 *   statePath: '/path/to/canvas-state.json',
 *   resolveBrowserContent: (content, opts) => browserAgent.resolveBrowserCanvasContent(content, opts),
 *   onStateChange: (state) => sendCanvasStateToRenderer(state),
 * });
 *
 * await canvasManager.open({ layout: 'right-docked', content: { type: 'browser', url: '...' } });
 * canvasManager.close();
 * const state = canvasManager.getState();
 * ```
 */
class CanvasManager {
  /**
   * @param {Object} options
   * @param {string} options.statePath - Path to persist canvas state JSON
   * @param {function(Object, Object): Promise<Object>} [options.resolveBrowserContent] - Browser content resolver
   * @param {function(Object): void} [options.onStateChange] - Called when state changes
   */
  constructor(options) {
    this._statePath = options.statePath;
    this._resolveBrowserContent = options.resolveBrowserContent || null;
    this._onStateChange = options.onStateChange || null;

    /** @type {Object} */
    this._state = createDefaultCanvasState();
  }

  /**
   * Get current canvas state (read-only copy).
   * @returns {Object}
   */
  getState() {
    return JSON.parse(JSON.stringify(this._state));
  }

  /**
   * Get internal state reference (for direct mutation — use carefully).
   * @returns {Object}
   */
  getStateRef() {
    return this._state;
  }

  /**
   * Update canvas state with partial overrides.
   * @param {Object} partial
   */
  updateState(partial) {
    this._state = { ...this._state, ...partial };
    this._persist();
    this._notifyChange();
  }

  /**
   * Open the canvas with given options.
   * @param {Object} [options]
   * @param {string} [options.layout] - Layout mode
   * @param {Object} [options.content] - Content object
   * @param {Object} [options.buildOptions] - Options for buildCanvasContent
   * @returns {Promise<{ok: boolean, state: Object, error: string|null}>}
   */
  async open(options = {}) {
    let content = options.content || this._state.content || createDefaultCanvasState().content;

    // Build/resolve content if needed
    if (content.type === 'browser' || (options.buildOptions && options.buildOptions.browser)) {
      content = await buildCanvasContent(content, {
        browser: options.buildOptions?.browser,
        resolveBrowserContent: this._resolveBrowserContent,
      });
    }

    this._state = {
      ...this._state,
      isOpen: true,
      layout: options.layout || this._state.layout || 'right-docked',
      content,
    };

    this._persist();
    this._notifyChange();

    return { ok: true, state: this._state, error: null };
  }

  /**
   * Close the canvas.
   * @returns {Object}
   */
  close() {
    this._state = {
      ...this._state,
      isOpen: false,
    };
    this._persist();
    this._notifyChange();
    return { ok: true, state: this._state };
  }

  /**
   * Toggle canvas open/close.
   * @param {Object} [options] - Options for opening (if currently closed)
   * @returns {Promise<{ok: boolean, state: Object, error: string|null}>}
   */
  async toggle(options = {}) {
    if (this._state.isOpen) {
      return this.close();
    }
    return this.open(options);
  }

  /**
   * Refresh browser canvas content.
   * @param {Object} [overrides] - Content overrides
   * @param {Object} [options] - Refresh options
   * @param {boolean} [options.navigate] - Whether to navigate (default: true)
   * @param {boolean} [options.showCanvas] - Whether to show canvas window
   * @returns {Promise<{ok: boolean, state: Object, error: string|null}>}
   */
  async refreshBrowser(overrides = {}, options = {}) {
    const baseContent = this._state.content?.type === 'browser'
      ? this._state.content
      : { type: 'browser', title: 'Browser', url: '' };

    const content = await buildCanvasContent(
      { ...baseContent, ...overrides, type: 'browser' },
      {
        browser: { navigate: options.navigate !== false },
        resolveBrowserContent: this._resolveBrowserContent,
      }
    );

    this._state = {
      ...this._state,
      isOpen: options.showCanvas === true ? true : this._state.isOpen,
      content,
    };

    this._persist();
    this._notifyChange();

    return {
      ok: content.status !== 'error',
      state: this._state,
      error: content.status === 'error' ? content.message : null,
    };
  }

  /**
   * Navigate browser canvas to a new URL.
   * @param {Object} overrides - Navigation overrides (url, title, etc.)
   * @returns {Promise<{ok: boolean, state: Object, error: string|null}>}
   */
  async navigateBrowser(overrides = {}) {
    // Close current browser canvas first
    if (this._state.isOpen) {
      this.close();
    }

    // Open with new URL
    const baseContent = this._state.content?.type === 'browser' ? this._state.content : {};
    return this.open({
      layout: this._state.layout,
      content: {
        type: 'browser',
        title: overrides.title || baseContent.title || 'Browser',
        url: overrides.url || overrides.value || overrides.query || baseContent.url || '',
        ...overrides,
      },
      buildOptions: { browser: { navigate: false } },
    });
  }

  /**
   * Set canvas layout.
   * @param {string} layout
   */
  setLayout(layout) {
    this._state = { ...this._state, layout: String(layout || 'right-docked') };
    this._persist();
    this._notifyChange();
  }

  /**
   * Check if canvas is currently open.
   * @returns {boolean}
   */
  isOpen() {
    return this._state.isOpen;
  }

  /**
   * Get current content type.
   * @returns {string}
   */
  getContentType() {
    return this._state.content?.type || 'empty';
  }

  /**
   * Load state from disk (if file exists).
   * @returns {Object}
   */
  loadFromDisk() {
    try {
      if (fs.existsSync(this._statePath)) {
        const data = JSON.parse(fs.readFileSync(this._statePath, 'utf-8'));
        this._state = { ...createDefaultCanvasState(), ...data };
        return { ok: true, state: this._state };
      }
    } catch (err) {
      console.error('[canvas-manager] Failed to load state from disk:', err.message);
    }
    return { ok: false, error: 'No state file or parse error' };
  }

  /**
   * Persist current state to disk.
   * @private
   */
  _persist() {
    try {
      const dir = path.dirname(this._statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this._statePath, JSON.stringify({
        isOpen: this._state.isOpen,
        layout: this._state.layout,
        content: serializeCanvasContentForPersistence(this._state.content),
        lastAvatarBoundsBeforeSplit: this._state.lastAvatarBoundsBeforeSplit,
      }, null, 2), 'utf-8');
    } catch (err) {
      console.error('[canvas-manager] Failed to persist state:', err.message);
    }
  }

  /**
   * Notify state change listener.
   * @private
   */
  _notifyChange() {
    if (typeof this._onStateChange === 'function') {
      try {
        this._onStateChange(this.getState());
      } catch (err) {
        console.error('[canvas-manager] onStateChange error:', err.message);
      }
    }
  }
}

module.exports = {
  CanvasManager,
  createDefaultCanvasState,
  buildCanvasContent,
  serializeCanvasContentForPersistence,
  inferCanvasContentTypeFromPath,
  toFileHref,
};
