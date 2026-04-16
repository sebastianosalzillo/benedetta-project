const MAX_CONTEXT_TOKENS = 8000;
const MAX_HISTORY_MESSAGES = 50;
const PRESERVE_RECENT = 10;
const TOKENS_PER_CHAR = 0.25;

function estimateMessageTokens(message) {
  const text = String(message.text || '');
  return Math.ceil(text.length * TOKENS_PER_CHAR) + 4;
}

function estimateTotalTokens(messages) {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

function isImportantMessage(message) {
  if (message.role === 'system') return true;
  if (message.compacted) return true;
  if (message.toolResult) return true;
  if (message.pinned) return true;
  return false;
}

function pruneSessionHistory(messages, options = {}) {
  const maxTokens = options.maxTokens || MAX_CONTEXT_TOKENS;
  const maxMessages = options.maxMessages || MAX_HISTORY_MESSAGES;
  const preserveRecent = options.preserveRecent || PRESERVE_RECENT;

  if (messages.length <= preserveRecent) {
    return { messages, pruned: 0, tokens: estimateTotalTokens(messages) };
  }

  const recent = messages.slice(-preserveRecent);
  const older = messages.slice(0, -preserveRecent);

  const important = older.filter(isImportantMessage);
  const normal = older.filter((m) => !isImportantMessage(m));

  normal.sort((a, b) => {
    const aTokens = estimateMessageTokens(a);
    const bTokens = estimateMessageTokens(b);
    return aTokens - bTokens;
  });

  let pruned = 0;
  let remaining = [...important, ...recent];

  while (remaining.length > maxMessages || estimateTotalTokens(remaining) > maxTokens) {
    if (normal.length === 0) break;
    normal.shift();
    remaining = [...important, ...normal, ...recent];
    pruned++;
  }

  const compactedMessages = compactOldMessages(normal.slice(0, 5));
  if (compactedMessages) {
    const systemMessages = remaining.filter((m) => m.role === 'system');
    const nonSystem = remaining.filter((m) => m.role !== 'system');
    const insertIndex = systemMessages.length;
    remaining = [...systemMessages, compactedMessages, ...nonSystem];
  }

  return {
    messages: remaining,
    pruned,
    tokens: estimateTotalTokens(remaining),
    compacted: !!compactedMessages,
  };
}

function compactOldMessages(messages) {
  if (!messages.length) return null;

  const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.text);
  const assistantMessages = messages.filter((m) => m.role === 'assistant').map((m) => m.text);

  const summary = [
    `[${messages.length} messages compacted]`,
    userMessages.length ? `User asked: ${userMessages.slice(-2).join('; ')}` : '',
    assistantMessages.length ? `Assistant replied about: ${assistantMessages.slice(-2).join('; ')}` : '',
  ].filter(Boolean).join('. ');

  return {
    id: `compacted-${Date.now()}`,
    role: 'system',
    text: summary,
    ts: new Date().toISOString(),
    compacted: true,
    originalCount: messages.length,
  };
}

function smartPrune(messages, userText, options = {}) {
  const totalTokens = estimateTotalTokens(messages);
  const maxTokens = options.maxTokens || MAX_CONTEXT_TOKENS;

  if (totalTokens <= maxTokens * 0.7) {
    return { messages, action: 'none', tokens: totalTokens };
  }

  if (totalTokens > maxTokens * 0.9) {
    const result = pruneSessionHistory(messages, options);
    return { ...result, action: 'prune' };
  }

  const oldestNormal = messages.findIndex((m) => !isImportantMessage(m) && m.role !== 'system');
  if (oldestNormal >= 0 && messages.length > 20) {
    const removed = messages.splice(oldestNormal, 1)[0];
    return {
      messages,
      action: 'remove_one',
      tokens: estimateTotalTokens(messages),
      removed: estimateMessageTokens(removed),
    };
  }

  return { messages, action: 'none', tokens: estimateTotalTokens(messages) };
}

function getContextStats(messages) {
  const totalTokens = estimateTotalTokens(messages);
  const byRole = {};
  for (const msg of messages) {
    byRole[msg.role] = (byRole[msg.role] || 0) + 1;
  }
  const compacted = messages.filter((m) => m.compacted).length;
  const important = messages.filter(isImportantMessage).length;

  return {
    totalMessages: messages.length,
    totalTokens,
    maxTokens: MAX_CONTEXT_TOKENS,
    usagePercent: Math.round((totalTokens / MAX_CONTEXT_TOKENS) * 100),
    byRole,
    compactedBlocks: compacted,
    importantMessages: important,
    normalMessages: messages.length - important - compacted,
  };
}

/**
 * Returns true when the chat history is approaching the compaction threshold
 * (above 75% of MAX_CONTEXT_TOKENS) but NOT yet at the prune threshold (90%).
 * Used to trigger a silent pre-compaction memory flush before messages are lost.
 */
function needsPreFlush(messages) {
  const totalTokens = estimateTotalTokens(messages);
  const ratio = totalTokens / MAX_CONTEXT_TOKENS;
  return ratio >= 0.75 && ratio < 0.90;
}

module.exports = {
  pruneSessionHistory,
  smartPrune,
  needsPreFlush,
  compactOldMessages,
  estimateMessageTokens,
  estimateTotalTokens,
  isImportantMessage,
  getContextStats,
  MAX_CONTEXT_TOKENS,
  MAX_HISTORY_MESSAGES,
  PRESERVE_RECENT,
  TOKENS_PER_CHAR,
};
