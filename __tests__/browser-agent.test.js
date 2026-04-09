jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  screen: {
    getAllDisplays: jest.fn(),
    getDisplayMatching: jest.fn(),
    getPrimaryDisplay: jest.fn(),
  },
}));

const {
  normalizeBrowserUrl,
  buildBrowserTitleFromUrl,
  trimBrowserText,
  parsePinchtabSnapshotText,
  getBrowserComparableState,
  getBrowserTabId,
  isYouTubeSearchRef,
} = require('../electron/browser-agent');

describe('browser-agent', () => {
  describe('normalizeBrowserUrl', () => {
    test('adds https to plain domain', () => {
      expect(normalizeBrowserUrl('example.com')).toBe('https://example.com');
    });

    test('leaves https URLs unchanged', () => {
      expect(normalizeBrowserUrl('https://example.com')).toBe('https://example.com');
    });

    test('converts search query to google search', () => {
      expect(normalizeBrowserUrl('test query')).toBe('https://www.google.com/search?q=test%20query');
    });
  });

  describe('buildBrowserTitleFromUrl', () => {
    test('extracts hostname from URL', () => {
      expect(buildBrowserTitleFromUrl('https://www.example.com/page')).toBe('example.com');
    });

    test('handles search query', () => {
      expect(buildBrowserTitleFromUrl('not-a-url')).toBe('google.com');
    });
  });

  describe('trimBrowserText', () => {
    test('trims and truncates text', () => {
      const longText = 'a'.repeat(10000);
      const result = trimBrowserText(longText, 100);
      expect(result.length).toBe(100);
      expect(result).toBe('a'.repeat(100));
    });
  });

  describe('parsePinchtabSnapshotText', () => {
    test('parses snapshot lines', () => {
      const text = 'header\nref1:role1 label1\nref2:role2 label2';
      const result = parsePinchtabSnapshotText(text);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('ref', 'ref1');
      expect(result[0]).toHaveProperty('role', 'role1');
    });
  });

  describe('getBrowserComparableState', () => {
    test('normalizes content for comparison', () => {
      const content = {
        currentUrl: 'https://example.com',
        pageTitle: 'Example',
        text: 'Some text\nwith lines',
      };
      const result = getBrowserComparableState(content);
      expect(result.currentUrl).toBe('https://example.com');
      expect(result.pageTitle).toBe('Example');
      expect(result.text).toBe('Some text with lines');
    });
  });

  describe('getBrowserTabId', () => {
    test('prefers the existing browser tab from content over canvas state', () => {
      expect(getBrowserTabId({ tabId: 'tab-1' }, { content: { tabId: 'tab-2' } })).toBe('tab-1');
    });

    test('falls back to the canvas state tab id', () => {
      expect(getBrowserTabId({}, { content: { tabId: 'tab-2' } })).toBe('tab-2');
    });
  });

  describe('isYouTubeSearchRef', () => {
    test('recognizes youtube search textbox refs from snapshot items', () => {
      expect(isYouTubeSearchRef('search-box', 'https://www.youtube.com', [
        { ref: 'search-box', role: 'textbox', label: 'Search' },
      ])).toBe(true);
    });

    test('returns false for non-youtube pages', () => {
      expect(isYouTubeSearchRef('search-box', 'https://example.com', [
        { ref: 'search-box', role: 'textbox', label: 'Search' },
      ])).toBe(false);
    });
  });
});
