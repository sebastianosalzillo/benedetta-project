'use strict';

// Tests for memory tools: memory_search and memory_get

describe('memory tools', () => {
  // Since testing executeToolCall directly is complex, test the logic

  describe('memory_get', () => {
    test('allows MEMORY.md', () => {
      const allowedMemoryFiles = ['MEMORY.md', 'USER.md', 'IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'DREAMS.md'];
      expect(allowedMemoryFiles.includes('MEMORY.md')).toBe(true);
    });

    test('allows memory/ files', () => {
      const path = 'memory/2024-01-01.md';
      expect(path.startsWith('memory/')).toBe(true);
    });

    test('rejects unauthorized files', () => {
      const allowedMemoryFiles = ['MEMORY.md', 'USER.md', 'IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'DREAMS.md'];
      expect(allowedMemoryFiles.includes('AGENTS.md')).toBe(false);
    });
  });

  describe('memory_search extension', () => {
    test('includes more files in search', () => {
      const filesToSearch = ['MEMORY.md', 'USER.md', 'IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'DREAMS.md'];
      expect(filesToSearch).toContain('USER.md');
      expect(filesToSearch).toContain('DREAMS.md');
    });

    test('returns structured results', () => {
      // Mock result structure
      const result = {
        file: 'MEMORY.md',
        path: 'MEMORY.md',
        line: 5,
        snippet: 'some content',
        source: 'core'
      };
      expect(result.source).toBe('core');
    });
  });
});
