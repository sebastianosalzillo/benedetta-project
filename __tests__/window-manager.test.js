jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  screen: {
    getAllDisplays: jest.fn(() => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]),
    getDisplayMatching: jest.fn(() => ({ id: 1 })),
    getPrimaryDisplay: jest.fn(() => ({ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
  },
}));

const fs = require('fs');
const {
  normalizeCanvasLayout,
  getCanvasBoundsForLayout,
  getWindowLayout,
  getDisplayById,
  isBoundsVisible,
  persistWindowStateNow,
  schedulePersistWindowState,
  getAvatarWindow,
  setAvatarWindow,
  getChatWindow,
  setChatWindow,
  getCanvasWindow,
  setCanvasWindow,
} = require('../electron/window-manager');

describe('window-manager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    setAvatarWindow(null);
    setChatWindow(null);
    setCanvasWindow(null);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('normalizeCanvasLayout', () => {
    test('normalizes "right" to "right-docked"', () => {
      expect(normalizeCanvasLayout('right')).toBe('right-docked');
    });

    test('normalizes "docked" to "right-docked"', () => {
      expect(normalizeCanvasLayout('docked')).toBe('right-docked');
    });

    test('normalizes "split" to "split-50"', () => {
      expect(normalizeCanvasLayout('split')).toBe('split-50');
    });

    test('returns "right-docked" for unknown layout', () => {
      expect(normalizeCanvasLayout('unknown')).toBe('right-docked');
    });
  });

  describe('getCanvasBoundsForLayout', () => {
    // Mock screen
    const mockWorkArea = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };

    const mockAvatarBounds = {
      x: 100,
      y: 100,
      width: 800,
      height: 600,
    };

    test('calculates bounds for right-docked layout', () => {
      const result = getCanvasBoundsForLayout('right-docked', mockAvatarBounds);
      expect(result).toHaveProperty('avatar');
      expect(result).toHaveProperty('canvas');
      expect(result.canvas.x).toBeGreaterThan(mockAvatarBounds.x + mockAvatarBounds.width);
    });

    test('calculates bounds for split-50 layout', () => {
      const result = getCanvasBoundsForLayout('split-50', mockAvatarBounds);
      expect(result.avatar.width).toBe(Math.floor(1920 / 2));
      expect(result.canvas.width).toBe(1920 - result.avatar.width);
    });
  });

  describe('isBoundsVisible', () => {
    test('returns false for null bounds', () => {
      expect(isBoundsVisible(null)).toBe(false);
    });

    test('returns true for visible bounds', () => {
      const bounds = { x: 100, y: 100, width: 200, height: 200 };
      expect(isBoundsVisible(bounds)).toBe(true);
    });
  });

  describe('window registry persistence', () => {
    function createMockWindow(bounds, alwaysOnTop = false) {
      return {
        isDestroyed: jest.fn(() => false),
        getBounds: jest.fn(() => bounds),
        isAlwaysOnTop: jest.fn(() => alwaysOnTop),
      };
    }

    test('persists current registry windows when explicit refs are omitted', () => {
      const app = { getPath: jest.fn(() => 'C:/tmp/app') };
      const avatarWindow = createMockWindow({ x: 10, y: 10, width: 600, height: 600 }, true);
      const chatWindow = createMockWindow({ x: 700, y: 20, width: 420, height: 800 }, true);

      setAvatarWindow(avatarWindow);
      setChatWindow(chatWindow);

      persistWindowStateNow(app);

      const [, payload] = fs.writeFileSync.mock.calls[0];
      const parsed = JSON.parse(payload);

      expect(parsed.avatar.bounds.width).toBe(600);
      expect(parsed.chat.bounds.width).toBe(420);
      expect(parsed.canvas).toBeUndefined();
    });

    test('debounced persistence reads latest registry state instead of stale refs', () => {
      const app = { getPath: jest.fn(() => 'C:/tmp/app') };
      const avatarWindow = createMockWindow({ x: 10, y: 10, width: 600, height: 600 }, true);
      const chatWindow = createMockWindow({ x: 700, y: 20, width: 420, height: 800 }, false);
      const canvasWindow = createMockWindow({ x: 1140, y: 20, width: 500, height: 800 }, false);

      setAvatarWindow(avatarWindow);
      schedulePersistWindowState(app);
      setChatWindow(chatWindow);
      setCanvasWindow(canvasWindow);

      jest.runOnlyPendingTimers();

      const [, payload] = fs.writeFileSync.mock.calls[0];
      const parsed = JSON.parse(payload);

      expect(parsed.avatar.bounds.width).toBe(600);
      expect(parsed.chat.bounds.width).toBe(420);
      expect(parsed.canvas.bounds.width).toBe(500);
      expect(getAvatarWindow()).toBe(avatarWindow);
      expect(getChatWindow()).toBe(chatWindow);
      expect(getCanvasWindow()).toBe(canvasWindow);
    });
  });
});
