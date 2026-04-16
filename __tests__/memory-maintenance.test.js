'use strict';

const {
  analyzeConversation,
  generateDreamNote,
} = require('../electron/dream-mode');

describe('dream-mode', () => {
  describe('analyzeConversation', () => {
    test('extracts preferences and topics', () => {
      const chatHistory = [
        { role: 'user', text: 'preferisco il rosso' },
        { role: 'user', text: 'parliamo di app web' },
        { role: 'assistant', text: 'ok' },
      ];

      const analysis = analyzeConversation(chatHistory);
      expect(analysis.preferences).toContain('preferisco il rosso');
      expect(analysis.topics).toContain('parliamo di app web');
      expect(analysis.totalUserMessages).toBe(2);
      expect(analysis.totalAssistantMessages).toBe(1);
    });
  });

  describe('generateDreamNote', () => {
    test('creates dream note content', () => {
      const analysis = {
        totalUserMessages: 5,
        totalAssistantMessages: 3,
        avgMessageLength: 100,
        preferences: ['pref1'],
        topics: ['topic1'],
      };
      const summary = 'conversation summary';

      const note = generateDreamNote(analysis, summary);
      expect(note.content).toContain('# Dream Note');
      expect(note.content).toContain('Messaggi utente: 5');
      expect(note.content).toContain('conversation summary');
    });
  });
});
