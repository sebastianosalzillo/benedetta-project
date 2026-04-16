const fs = require('fs');
const path = require('path');
const { getWorkspaceFilePath, getWorkspaceDailyMemoryPath } = require('./workspace-manager');

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

/**
 * Write a daily memory note to workspace/memory/YYYY-MM-DD.md
 */
function writeDailyMemoryNote(app, content) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const filePath = path.join(getWorkspaceDailyMemoryPath(app), `${today}.md`);
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    const separator = existing.trim() ? '\n\n---\n\n' : '';
    fs.writeFileSync(filePath, `${existing}${separator}${content}\n`, 'utf-8');
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Read recent daily memory notes.
 */
function readRecentDailyNotes(app, days = 7) {
  try {
    const memoryDir = getWorkspaceDailyMemoryPath(app);
    if (!fs.existsSync(memoryDir)) return [];

    const files = fs.readdirSync(memoryDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, days);

    return files.map(file => {
      const filePath = path.join(memoryDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      return { date: file.slice(0, 10), content };
    });
  } catch (error) {
    return [];
  }
}

/**
 * Promote durable facts from daily notes to MEMORY.md
 */
function promoteToMemory(app, recentNotes) {
  try {
    const memoryPath = getWorkspaceFilePath(app, 'MEMORY.md');
    const existing = fs.existsSync(memoryPath) ? fs.readFileSync(memoryPath, 'utf-8') : '';

    // Simple promotion: extract lines that seem like facts (contain keywords)
    const facts = [];
    for (const note of recentNotes) {
      const lines = note.content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-') &&
            (trimmed.includes('prefer') || trimmed.includes('sempre') || trimmed.includes('mai') ||
             trimmed.includes('nome') || trimmed.includes('età'))) {
          facts.push(`${note.date}: ${trimmed}`);
        }
      }
    }

    if (facts.length > 0) {
      const promoted = `\n## Promoted ${new Date().toISOString()}\n${facts.slice(0, 10).join('\n')}\n`;
      fs.writeFileSync(memoryPath, `${existing}${promoted}`, 'utf-8');
    }

    return { ok: true, promoted: facts.length };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Update DREAMS.md with maintenance summary.
 */
function updateDreamDiary(app, summary) {
  try {
    const dreamsPath = getWorkspaceFilePath(app, 'DREAMS.md');
    const existing = fs.existsSync(dreamsPath) ? fs.readFileSync(dreamsPath, 'utf-8') : '';
    const entry = `\n## ${new Date().toISOString()}\n${summary}\n`;
    fs.writeFileSync(dreamsPath, `${existing}${entry}`, 'utf-8');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Run memory maintenance cycle.
 */
function runMemoryMaintenance(app) {
  try {
    const recentNotes = readRecentDailyNotes(app);
    const promotion = promoteToMemory(app, recentNotes);
    const summary = `Maintenance: ${recentNotes.length} daily notes read, ${promotion.ok ? promotion.promoted : 0} facts promoted.`;
    updateDreamDiary(app, summary);
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, error: error.message };
  }
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
  writeDailyMemoryNote,
  readRecentDailyNotes,
  promoteToMemory,
  updateDreamDiary,
  runMemoryMaintenance,
  DREAM_IDLE_TIMEOUT_MS,
  MAX_DREAM_NOTES,
};
