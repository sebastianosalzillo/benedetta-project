const fs = require('fs');
const path = require('path');

const DREAM_IDLE_TIMEOUT_MS = 300000;
const MAX_DREAM_NOTES = 20;

function createDefaultDreamState() {
  return {
    isActive: false,
    lastInteractionAt: null,
    lastDreamAt: null,
    dreamCount: 0,
    timerId: null,
    lastHistoryLen: 0, // Fix B: deduplication
  };
}

function onUserInteraction(dreamState) {
  dreamState.lastInteractionAt = Date.now();
  if (dreamState.isActive) {
    dreamState.isActive = false;
    if (dreamState.timerId) {
      clearTimeout(dreamState.timerId);
      dreamState.timerId = null;
    }
  }
}

function scheduleDream(dreamState, fn) {
  if (dreamState.timerId) clearTimeout(dreamState.timerId);
  dreamState.timerId = setTimeout(() => {
    const now = Date.now();
    const idleTime = now - (dreamState.lastInteractionAt || now);
    if (idleTime >= DREAM_IDLE_TIMEOUT_MS) {
      dreamState.isActive = true;
      dreamState.lastDreamAt = new Date().toISOString();
      dreamState.dreamCount += 1;
      fn().finally(() => {
        dreamState.isActive = false;
        dreamState.timerId = null;
        scheduleDream(dreamState, fn);
      });
    } else {
      dreamState.timerId = null;
      scheduleDream(dreamState, fn);
    }
  }, DREAM_IDLE_TIMEOUT_MS);
}

function analyzeConversation(chatHistory) {
  const preferences = new Set();
  const topics = new Set();
  const userMessages = chatHistory.filter((m) => m.role === 'user');
  const assistantMessages = chatHistory.filter((m) => m.role === 'assistant');

  for (const msg of userMessages) {
    const text = String(msg.text || '').toLowerCase();
    if (text.includes('preferisc') || text.includes('mi piace') || text.includes('non mi piace') || text.includes('odio') || text.includes('amo')) {
      preferences.add(msg.text.trim().slice(0, 200));
    }
    if (text.includes('progett') || text.includes('app') || text.includes('sito') || text.includes('codice') || text.includes('programma')) {
      topics.add(msg.text.trim().slice(0, 100));
    }
  }

  return {
    preferences: Array.from(preferences).slice(0, 10),
    topics: Array.from(topics).slice(0, 10),
    totalUserMessages: userMessages.length,
    totalAssistantMessages: assistantMessages.length,
    avgMessageLength: chatHistory.length > 0
      ? Math.round(chatHistory.reduce((sum, m) => sum + String(m.text || '').length, 0) / chatHistory.length)
      : 0,
  };
}

function generateDreamNote(analysis, conversationSummary) {
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const lines = [
    `# Dream Note - ${now.toISOString()}`,
    '',
    `## Sessione`,
    `- Messaggi utente: ${analysis.totalUserMessages}`,
    `- Messaggi assistant: ${analysis.totalAssistantMessages}`,
    `- Lunghezza media messaggio: ${analysis.avgMessageLength} caratteri`,
    '',
    analysis.preferences.length ? `## Preferenze Rilevate\n${analysis.preferences.map((p) => `- ${p}`).join('\n')}` : '',
    analysis.topics.length ? `## Argomenti Discussi\n${analysis.topics.map((t) => `- ${t}`).join('\n')}` : '',
    '',
    `## Summary`,
    conversationSummary || 'Nessun contenuto rilevante.',
  ].filter(Boolean);

  return { dateKey, content: lines.join('\n') };
}

function saveDreamNote(dreamPath, note) {
  try {
    if (!fs.existsSync(dreamPath)) {
      fs.mkdirSync(dreamPath, { recursive: true });
    }
    const filePath = path.join(dreamPath, `${note.dateKey}.md`);
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    const separator = existing.trim() ? '\n\n---\n\n' : '';
    fs.writeFileSync(filePath, `${existing}${separator}${note.content}\n`, 'utf-8');
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function cleanupOldDreams(dreamPath, maxNotes = MAX_DREAM_NOTES) {
  try {
    if (!fs.existsSync(dreamPath)) return { ok: true };
    const files = fs.readdirSync(dreamPath)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse();
    if (files.length > maxNotes) {
      for (const file of files.slice(maxNotes)) {
        fs.unlinkSync(path.join(dreamPath, file));
      }
    }
    return { ok: true, remaining: Math.min(files.length, maxNotes) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function stopDream(dreamState) {
  if (dreamState.timerId) {
    clearTimeout(dreamState.timerId);
    dreamState.timerId = null;
  }
  dreamState.isActive = false;
}

function getDreamStatus(dreamState) {
  return {
    isActive: dreamState.isActive,
    lastInteractionAt: dreamState.lastInteractionAt ? new Date(dreamState.lastInteractionAt).toISOString() : null,
    lastDreamAt: dreamState.lastDreamAt,
    dreamCount: dreamState.dreamCount,
    idleTimeoutMs: DREAM_IDLE_TIMEOUT_MS,
  };
}

module.exports = {
  createDefaultDreamState,
  onUserInteraction,
  scheduleDream,
  analyzeConversation,
  generateDreamNote,
  saveDreamNote,
  cleanupOldDreams,
  stopDream,
  getDreamStatus,
  DREAM_IDLE_TIMEOUT_MS,
  MAX_DREAM_NOTES,
};
