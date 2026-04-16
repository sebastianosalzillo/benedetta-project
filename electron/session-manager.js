const {
  compactCurrentSessionHistory: wmCompactCurrentSessionHistory,
  startFreshSession: wmStartFreshSession,
  resetChatSessionState,
  prepareChatSession,
  persistCurrentSessionRecord,
  appendSessionFlushToDailyMemory,
} = require('./workspace-manager');
const { createMessageId } = require('./workspace-manager');

function createSessionManager(context) {
  const {
    app,
    getChatHistory = () => [],
    setChatHistory = (h) => {},
    getChatSession = () => ({}),
    setChatSession = (s) => {},
    getAgentSession = () => ({}),
    readTextFile,
    writeTextFile,
    writeJsonFile,
    getWorkspaceDailyMemoryPath,
    getChatHistoryPath,
    getChatSessionPath,
    getSessionRecordPath,
    getSessionMarkdownPath,
    buildConversationSummary,
    MAX_CHAT_HISTORY,
  } = context;

  function compactCurrentSessionHistory() {
    const chatHistory = getChatHistory();
    const chatSession = getChatSession();
    if (chatHistory.length <= 8) return { ok: false, error: 'Sessione troppo corta per compattare.' };
    const preservedHead = chatHistory.slice(0, 1);
    const preservedTail = chatHistory.slice(-2);
    const middle = chatHistory.slice(1, -2);
    const summaryMessage = {
      id: createMessageId('system'),
      role: 'system',
      text: `Compaction summary: ${buildConversationSummary(middle) || 'Nessun contenuto rilevante.'}`,
      ts: new Date().toISOString(),
      compacted: true,
    };
    const newHistory = [...preservedHead, summaryMessage, ...preservedTail].slice(-MAX_CHAT_HISTORY);
    setChatHistory(newHistory);
    setChatSession({ ...chatSession, compactionCount: Number(chatSession.compactionCount || 0) + 1 });
    writeJsonFile(getChatSessionPath(), getChatSession());
    writeJsonFile(getChatHistoryPath(), newHistory.slice(-MAX_CHAT_HISTORY));
    return { ok: true, summaryMessage, chatHistory: newHistory };
  }

  function startFreshSession(reason = 'manual-reset') {
    const chatHistory = getChatHistory();
    const chatSession = getChatSession();
    const agentSession = getAgentSession();
    const relevantMessages = chatHistory.filter((m) => m?.text);
    if (relevantMessages.length) {
      const now = new Date();
      const dateKey = now.toISOString().slice(0, 10);
      const dailyPath = path.join(getWorkspaceDailyMemoryPath(), `${dateKey}.md`);
      const header = readTextFile(dailyPath, '').trim() ? '\n\n' : '# Daily Memory\n\n';
      const block = [
        `## ${now.toISOString()} | ${reason}`,
        '',
        `- Sessione: ${chatSession?.id || 'unknown'}`,
        `- Messaggi: ${relevantMessages.length}`,
        '',
        '### Summary',
        '',
        buildConversationSummary(relevantMessages) || 'Nessun contenuto rilevante.',
      ].join('\n');
      writeTextFile(dailyPath, `${readTextFile(dailyPath, '').trim()}${header}${block}\n`, 50000);
    }
    setChatHistory([]);
    setChatSession({ id: '', createdAt: '', lastUsedAt: '', compactionCount: 0 });
    writeJsonFile(getChatHistoryPath(), []);
    writeJsonFile(getChatSessionPath(), getChatSession());
    return { chatHistory: [], chatSession: getChatSession() };
  }

  return {
    compactCurrentSessionHistory,
    startFreshSession,
  };
}

module.exports = { createSessionManager };
