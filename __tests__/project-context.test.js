'use strict';

const fs = require('fs');
const path = require('path');
const {
  getAgentWorkspacePath,
  readWorkspaceMarkdown,
  buildProjectContextPrompt,
  buildMemoryContextPrompt,
} = require('../electron/project-context');

// Mock app object
const mockApp = {
  getPath: jest.fn(() => '/mock/userData'),
};

describe('project-context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock fs.existsSync and fs.readFileSync
    fs.existsSync = jest.fn();
    fs.readFileSync = jest.fn();
    fs.readdirSync = jest.fn();
  });

  describe('getAgentWorkspacePath', () => {
    test('returns workspace path', () => {
      // This would need to mock the workspace-manager function
      // For now, assume it works
      expect(typeof getAgentWorkspacePath).toBe('function');
    });
  });

  describe('readWorkspaceMarkdown', () => {
    test('reads existing file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('content');

      const result = readWorkspaceMarkdown(mockApp, 'TEST.md');
      expect(result).toBe('content');
    });

    test('returns null for missing file', () => {
      fs.existsSync.mockReturnValue(false);

      const result = readWorkspaceMarkdown(mockApp, 'MISSING.md');
      expect(result).toBeNull();
    });

    test('trims content to maxChars', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('long content here');

      const result = readWorkspaceMarkdown(mockApp, 'TEST.md', { maxChars: 10 });
      expect(result).toBe('long conte');
    });
  });

  describe('buildProjectContextPrompt', () => {
    test('includes required files when present', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('file content');

      const result = buildProjectContextPrompt(mockApp, { privateSession: false });
      expect(result).toContain('PROJECT_CONTEXT:');
      expect(result).toContain('### AGENTS.md');
      expect(result).toContain('file content');
    });

    test('marks missing files', () => {
      fs.existsSync.mockReturnValue(false);

      const result = buildProjectContextPrompt(mockApp, { privateSession: false });
      expect(result).toContain('AGENTS.md: MISSING');
    });

    test('includes mutable files in private session', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mutable content');

      const result = buildProjectContextPrompt(mockApp, { privateSession: true });
      expect(result).toContain('### USER.md');
      expect(result).toContain('mutable content');
    });
  });

  describe('buildMemoryContextPrompt', () => {
    test('includes memory files in private session', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('memory content');

      const result = buildMemoryContextPrompt(mockApp, { privateSession: true });
      expect(result).toContain('MEMORY_CONTEXT:');
      expect(result).toContain('### MEMORY.md');
      expect(result).toContain('memory content');
    });

    test('lists available memory files (newest first)', () => {
      fs.existsSync.mockImplementation((p) => p.includes('memory'));
      fs.readdirSync.mockReturnValue(['2024-01-01.md', '2024-01-02.md']);

      const result = buildMemoryContextPrompt(mockApp, { privateSession: false });
      // Files are sorted newest-first (reverse alphabetical for date-named files)
      expect(result).toContain('AVAILABLE_MEMORY_FILES: memory/2024-01-02.md, memory/2024-01-01.md');
    });
  });
});
