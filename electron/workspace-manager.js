const path = require('path');
const fs = require('fs');
const {
  WORKSPACE_DIRNAME,
  WORKSPACE_DAILY_MEMORY_DIRNAME,
  SESSIONS_DIRNAME,
  WORKSPACE_REQUIRED_FILES,
  WORKSPACE_MUTABLE_FILES,
  WORKSPACE_FILE_MAX_CHARS,
  WORKSPACE_TOTAL_MAX_CHARS,
  WORKSPACE_DAILY_NOTE_MAX_CHARS,
  SESSION_SEARCH_MAX_RESULTS,
  MEMORY_SEARCH_MAX_RESULTS,
  MAX_CHAT_HISTORY,
  MAX_INITIAL_PROMPT_HISTORY,
  MAX_DAILY_MEMORY_NOTES,
  MAX_COMPACT_PRESERVE_TAIL,
  MAX_RECENT_TURNS_FOR_SESSION,
  MAX_RECENT_TURNS_FOR_SUMMARY,
  MAX_STABLE_PREFERENCES,
  MAX_RECENT_TOPICS,
  MAX_WORD_COUNT_REQUEST,
  MIN_WORD_COUNT_REQUEST,
  DEFAULT_WORD_COUNT,
  MAX_SUMMARY_LENGTH,
  MAX_SESSION_TURN_LENGTH,
  MAX_USER_PREFERENCE_LENGTH,
  MAX_TOPIC_LENGTH,
  BOOTSTRAP_FIELDS,
  BOOTSTRAP_EMPTY_VALUES,
  PREFERENCE_KEYWORDS,
  ENABLE_LIVE_CANVAS,
} = require('./constants');

/**
 * Normalize a line of text to a max length.
 */
function normalizeLine(text, maxLength) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function truncateWithMarker(text, maxChars, marker = '\n\n[TRUNCATED]') {
  const normalized = String(text || '').trim();
  if (!normalized || !Number.isFinite(maxChars) || maxChars <= 0) return '';
  if (normalized.length <= maxChars) return normalized;
  const safeMarker = String(marker || '');
  const cutoff = Math.max(0, maxChars - safeMarker.length);
  return `${normalized.slice(0, cutoff).trim()}${safeMarker}`;
}

/**
 * Truncate text with truncation marker.
 */
function truncatePromptText(text, maxChars) {
  return truncateWithMarker(text, maxChars);
}

/**
 * Normalize speech text.
 */
function normalizeSpeechText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/gu, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// ============================================================
// File I/O helpers
// ============================================================

function getAppFilePath(app, name) {
  return path.join(app.getPath('userData'), name);
}

function readJsonFile(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function readTextFile(filePath, fallback = '') {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return fallback; }
}

/**
 * Write text file with write-side character limit enforcement.
 * Prevents workspace files from growing indefinitely.
 */
function writeTextFile(filePath, value, maxChars = null) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let text = String(value || '');
  if (maxChars && text.length > maxChars) {
    text = truncateWithMarker(text, maxChars);
  }
  fs.writeFileSync(filePath, text, 'utf8');
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

// ============================================================
// Workspace paths
// ============================================================

function getWorkspacePath(app) {
  return getAppFilePath(app, WORKSPACE_DIRNAME);
}

function getWorkspaceDailyMemoryPath(app) {
  return path.join(getWorkspacePath(app), WORKSPACE_DAILY_MEMORY_DIRNAME);
}

function getWorkspaceFilePath(app, name) {
  return path.join(getWorkspacePath(app), name);
}

function resolveWorkspacePath(app, requestPath = '') {
  const trimmed = String(requestPath || '').trim().replace(/^[/\\]+/, '');
  if (!trimmed) return null;
  const workspaceRoot = path.resolve(getWorkspacePath(app));
  const resolved = path.resolve(workspaceRoot, trimmed);
  if (!resolved.startsWith(workspaceRoot)) return null;
  return { resolved, workspaceRoot };
}

function getSessionsDirPath(app) {
  return path.join(getWorkspacePath(app), SESSIONS_DIRNAME);
}

function getLegacySessionsDirPath(app) {
  return getAppFilePath(app, SESSIONS_DIRNAME);
}

function getSessionRecordPath(app, sessionId) {
  return path.join(getSessionsDirPath(app), `${sessionId}.json`);
}

function getSessionMarkdownPath(app, sessionId) {
  return path.join(getSessionsDirPath(app), `${sessionId}.md`);
}

function getChatHistoryPath(app) {
  return getAppFilePath(app, 'chat-history.json');
}

function getNyxMemoryPath(app) {
  return getAppFilePath(app, 'nyx-memory.json');
}

function getAcpSessionPath(app) {
  return getAppFilePath(app, 'acp-session.json');
}

function getChatSessionPath(app) {
  return getAppFilePath(app, 'chat-session.json');
}

function getBootstrapStatePath(app) {
  return getAppFilePath(app, 'bootstrap-state.json');
}

// ============================================================
// Workspace file management
// ============================================================

function getWorkspaceMemoryFileName(app) {
  if (fs.existsSync(getWorkspaceFilePath(app, 'MEMORY.md'))) return 'MEMORY.md';
  if (fs.existsSync(getWorkspaceFilePath(app, 'memory.md'))) return 'memory.md';
  return '';
}

function listRecentDailyMemoryNotes(app, limit = 2) {
  const memoryDir = getWorkspaceDailyMemoryPath(app);
  if (!fs.existsSync(memoryDir)) return [];
  try {
    return fs.readdirSync(memoryDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map((entry) => {
        const fullPath = path.join(memoryDir, entry.name);
        const stats = fs.statSync(fullPath);
        return {
          name: entry.name,
          relativePath: `${WORKSPACE_DAILY_MEMORY_DIRNAME}/${entry.name}`.replace(/\\/g, '/'),
          fullPath,
          updatedAt: stats.mtime.toISOString(),
          size: stats.size,
        };
      })
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, limit);
  } catch { return []; }
}

function extractMeaningfulMarkdownLines(text = '') {
  return String(text || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*#+\s*/, '').replace(/^\s*[-*]\s+\[(?: |x)\]\s*/, '').replace(/^\s*[-*]\s+/, '').trim())
    .filter((line) => line && !/^(agents|soul|tools|identity|user|heartbeat|boot|bootstrap|memory)$/i.test(line));
}

function hasMeaningfulMarkdownContent(text = '') {
  return extractMeaningfulMarkdownLines(text).length > 0;
}

function buildDefaultWorkspaceFiles() {
  const username = String(process.env.USERNAME || 'user').trim() || 'user';
  return {
    'AGENTS.md': [
      '# AGENTS', '', '- This workspace describes the stable behavior of the assistant.',
      '- Respond in English, directly and concisely.',
      ENABLE_LIVE_CANVAS ? '- Use CANVAS and BROWSER only when they add real value.' : '- Use BROWSER or COMPUTER only when they add real value.',
      '- If a durable preference emerges, suggest saving it to workspace files rather than relying on chat history.',
    ].join('\n'),
    'SOUL.md': [
      '# SOUL', '', 'The assistant is a pragmatic, clear-headed, and concrete desktop avatar.',
      'Avoid artificial enthusiasm, filler words, and unnecessary reassurances.',
      'When something is ambiguous, clarify it with precision.',
    ].join('\n'),
    'TOOLS.md': [
      '# TOOLS', '', '- Direct ACP via Qwen CLI with session resume.',
      '- Real browser via PinchTab.',
      ...(ENABLE_LIVE_CANVAS ? ['- Side canvas for text, clipboard, files, images, video, and audio.'] : ['- Real computer use for windows, controls, and desktop input.']),
      '- Local TTS for playback and lipsync.',
    ].join('\n'),
    'IDENTITY.md': [
      '# IDENTITY', '', '- Name: Assistant',
      ENABLE_LIVE_CANVAS ? '- Type: desktop avatar with chat, canvas, and browser' : '- Type: desktop avatar with chat, browser, and computer use',
      '- Default mode: technical and operational assistant',
    ].join('\n'),
    'USER.md': [
      '# USER', '', `- Primary local user: ${username}`,
      '- Main environment: Windows desktop',
      '- Update this file with stable preferences, tone, naming, and preferred workflows.',
    ].join('\n'),
    'HEARTBEAT.md': ['# HEARTBEAT', '', '<!-- Add periodic checklists to keep in mind here. -->'].join('\n'),
    'BOOT.md': ['# BOOT', '', '<!-- Add a checklist to apply on the first prompt after app startup. -->'].join('\n'),
    'BOOTSTRAP.md': [
      '# BOOTSTRAP', '', 'First workspace startup.', '',
      '1. Review AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, and USER.md.',
      '2. Replace placeholders with real instructions and preferences.',
      '3. If needed, create MEMORY.md and files in memory/YYYY-MM-DD.md.',
      '4. When bootstrap is complete, run /bootstrap done or use the dedicated button in the chat.',
    ].join('\n'),
  };
}

function ensureWorkspaceBootstrap(app) {
  const workspacePath = getWorkspacePath(app);
  const memoryDir = getWorkspaceDailyMemoryPath(app);
  const sessionsDir = getSessionsDirPath(app);
  const defaults = buildDefaultWorkspaceFiles();
  const hasBootstrapContext = [...WORKSPACE_REQUIRED_FILES, 'BOOTSTRAP.md', 'MEMORY.md', 'memory.md']
    .some((name) => fs.existsSync(path.join(workspacePath, name)));

  ensureDirectory(workspacePath);
  ensureDirectory(memoryDir);
  ensureDirectory(sessionsDir);

  for (const fileName of [...WORKSPACE_REQUIRED_FILES, 'BOOT.md']) {
    const filePath = getWorkspaceFilePath(app, fileName);
    if (!fs.existsSync(filePath)) {
      writeTextFile(filePath, defaults[fileName], WORKSPACE_FILE_MAX_CHARS);
    }
  }

  if (!hasBootstrapContext && !fs.existsSync(getWorkspaceFilePath(app, 'BOOTSTRAP.md'))) {
    writeTextFile(getWorkspaceFilePath(app, 'BOOTSTRAP.md'), defaults['BOOTSTRAP.md'], WORKSPACE_FILE_MAX_CHARS);
  }

  // Migrate legacy sessions
  const legacySessionsDir = getLegacySessionsDirPath(app);
  if (fs.existsSync(legacySessionsDir) && path.resolve(legacySessionsDir) !== path.resolve(sessionsDir)) {
    try {
      for (const entry of fs.readdirSync(legacySessionsDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const sourcePath = path.join(legacySessionsDir, entry.name);
        const targetPath = path.join(sessionsDir, entry.name);
        if (!fs.existsSync(targetPath)) fs.copyFileSync(sourcePath, targetPath);
      }
    } catch { /* ignore best-effort migration errors */ }
  }
}

function readWorkspaceState(app, bootstrapState, startupBootPrompt) {
  const workspacePath = getWorkspacePath(app);
  const files = [...WORKSPACE_REQUIRED_FILES, 'BOOT.md', 'BOOTSTRAP.md', 'MEMORY.md', 'memory.md']
    .map((name) => {
      const filePath = getWorkspaceFilePath(app, name);
      if (!fs.existsSync(filePath)) return { name, exists: false, updatedAt: null, size: 0 };
      const stats = fs.statSync(filePath);
      return { name, exists: true, updatedAt: stats.mtime.toISOString(), size: stats.size };
    });

  return {
    path: workspacePath,
    dailyMemoryPath: getWorkspaceDailyMemoryPath(app),
    memoryFile: getWorkspaceMemoryFileName(app),
    bootstrapPending: fs.existsSync(getWorkspaceFilePath(app, 'BOOTSTRAP.md')),
    bootConfigured: hasMeaningfulMarkdownContent(readTextFile(getWorkspaceFilePath(app, 'BOOT.md'), '')),
    startupBootPending: Boolean(startupBootPrompt),
    files,
    missingRequiredFiles: WORKSPACE_REQUIRED_FILES.filter((name) => !fs.existsSync(getWorkspaceFilePath(app, name))),
    dailyNotes: listRecentDailyMemoryNotes(app),
    bootstrapActive: Boolean(bootstrapState?.active),
    bootstrapStepIndex: Number(bootstrapState?.stepIndex || 0),
    bootstrapTotalSteps: Math.max(1, Number(bootstrapState?.stepIndex || 0)),
    bootstrapQuestion: bootstrapState?.active ? String(bootstrapState.currentPrompt || '').trim() : '',
    updatedAt: new Date().toISOString(),
  };
}

function buildWorkspaceProjectContextPrompt(app, fileNames, options = {}) {
  const { title = 'PROJECT_CONTEXT', includeMissingMarkers = false, perFileMaxChars = WORKSPACE_FILE_MAX_CHARS, totalMaxChars = WORKSPACE_TOTAL_MAX_CHARS } = options;
  let remaining = totalMaxChars;
  const sections = [];

  for (const fileName of fileNames) {
    if (!fileName || remaining <= 0) break;
    const filePath = getWorkspaceFilePath(app, fileName);
    if (!fs.existsSync(filePath)) {
      if (includeMissingMarkers) sections.push(`[${fileName}]\n[missing]`);
      continue;
    }
    const raw = readTextFile(filePath, '').trim();
    if (!raw) {
      if (includeMissingMarkers) sections.push(`[${fileName}]\n[empty]`);
      continue;
    }
    const content = truncatePromptText(raw, Math.min(perFileMaxChars, remaining));
    if (!content) continue;
    sections.push(`[${fileName}]\n${content}`);
    remaining -= content.length;
  }

  return sections.length ? `${title}:\n${sections.join('\n\n')}` : '';
}

function buildRecentDailyMemoryPrompt(app, limit = 2) {
  let remaining = Math.max(WORKSPACE_DAILY_NOTE_MAX_CHARS, limit * WORKSPACE_DAILY_NOTE_MAX_CHARS);
  const sections = [];
  for (const note of listRecentDailyMemoryNotes(app, limit)) {
    if (remaining <= 0) break;
    const raw = readTextFile(note.fullPath, '').trim();
    if (!hasMeaningfulMarkdownContent(raw)) continue;
    const content = truncatePromptText(raw, Math.min(WORKSPACE_DAILY_NOTE_MAX_CHARS, remaining));
    if (!content) continue;
    sections.push(`[${note.relativePath}]\n${content}`);
    remaining -= content.length;
  }
  return sections.length ? `RECENT_DAILY_MEMORY:\n${sections.join('\n\n')}` : '';
}

// ============================================================
// Workspace update with write-side enforcement
// ============================================================

function buildWorkspaceUpdateBlock(directive = {}) {
  const title = directive.title ? `## ${directive.title}` : `## Update ${new Date().toISOString()}`;
  return [title, '', directive.content || '', ''].join('\n');
}

function applyWorkspaceUpdate(app, directive = {}) {
  const fileName = String(directive.file || '').trim();
  if (!WORKSPACE_MUTABLE_FILES.includes(fileName)) {
    return { ok: false, error: 'Workspace update not allowed for this file.' };
  }

  const filePath = getWorkspaceFilePath(app, fileName);
  const content = normalizeSpeechText(String(directive.content || ''));
  if (!content) return { ok: false, error: 'Workspace update has no content.' };

  const current = readTextFile(filePath, '');
  if (current.includes(content)) return { ok: true, skipped: true, file: fileName, path: filePath };

  const mode = String(directive.mode || 'append').trim().toLowerCase();
  let nextText = current;

  if (mode === 'replace') {
    nextText = content.endsWith('\n') ? content : `${content}\n`;
  } else {
    const prefix = current.trim() ? '\n\n' : '';
    nextText = `${current.trimEnd()}${prefix}${buildWorkspaceUpdateBlock(directive)}`.trimEnd() + '\n';
  }

  // Enforce total file size limit
  writeTextFile(filePath, nextText, WORKSPACE_FILE_MAX_CHARS);
  return { ok: true, file: fileName, path: filePath };
}

function buildWorkspaceSavedMessage(result = {}) {
  const label = result.skipped ? 'Workspace already up to date' : 'Saved to workspace';
  const file = String(result.file || '').trim();
  return {
    id: `system-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role: 'system',
    text: file ? `${label}: ${file}` : label,
    ts: new Date().toISOString(),
  };
}

// ============================================================
// Memory search
// ============================================================

function tokenizeSearchQuery(query = '') {
  return Array.from(new Set(
    String(query || '').toLowerCase().split(/[^a-z0-9àèéìòóù_-]+/i).map((t) => t.trim()).filter((t) => t.length >= 2),
  ));
}

function scoreSearchText(text = '', tokens = []) {
  const haystack = String(text || '').toLowerCase();
  if (!haystack || !tokens.length) return 0;
  let score = 0;
  for (const token of tokens) {
    const matches = haystack.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
    if (matches?.length) score += matches.length;
  }
  return score;
}

function buildSearchSnippet(text = '', tokens = [], maxLength = 220) {
  const source = normalizeLine(text, 6000);
  if (!source) return '';
  let startIndex = 0;
  for (const token of tokens) {
    const index = source.toLowerCase().indexOf(token.toLowerCase());
    if (index >= 0) { startIndex = Math.max(0, index - 70); break; }
  }
  const snippet = source.slice(startIndex, startIndex + maxLength).trim();
  return startIndex > 0 ? `...${snippet}` : snippet;
}

function runMemorySearch(app, query, options = {}) {
  const maxResults = options.maxResults || MEMORY_SEARCH_MAX_RESULTS;
  const tokens = tokenizeSearchQuery(query);
  if (!tokens.length) return [];

  const candidates = [];
  const memoryFileName = getWorkspaceMemoryFileName(app);
  const staticFiles = [memoryFileName].filter(Boolean);

  for (const fileName of staticFiles) {
    const filePath = getWorkspaceFilePath(app, fileName);
    const text = readTextFile(filePath, '');
    const score = scoreSearchText(text, tokens);
    if (!score) continue;
    candidates.push({ path: fileName, score: score + 2, snippet: buildSearchSnippet(text, tokens) });
  }

  for (const note of listRecentDailyMemoryNotes(app, MAX_DAILY_MEMORY_NOTES)) {
    const text = readTextFile(note.fullPath, '');
    const score = scoreSearchText(text, tokens);
    if (!score) continue;
    candidates.push({ path: note.relativePath, score, snippet: buildSearchSnippet(text, tokens) });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

function runSessionSearch(app, query, options = {}) {
  const maxResults = options.maxResults || SESSION_SEARCH_MAX_RESULTS;
  const tokens = tokenizeSearchQuery(query);
  if (!tokens.length) return [];

  const sessionsDir = getSessionsDirPath(app);
  if (!fs.existsSync(sessionsDir)) return [];

  try {
    return fs.readdirSync(sessionsDir)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .map((name) => readJsonFile(path.join(sessionsDir, name), null))
      .filter(Boolean)
      .map((record) => {
        const markdownPath = getSessionMarkdownPath(app, record.id);
        const text = fs.existsSync(markdownPath) ? readTextFile(markdownPath, '') : (record.messages || []).map((m) => `${m.role}: ${m.text || ''}`).join('\n');
        const score = scoreSearchText(text, tokens);
        if (!score) return null;
        return { id: record.id, score, updatedAt: record.lastUsedAt || record.createdAt || null, snippet: buildSearchSnippet(text, tokens) };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  } catch { return []; }
}

// ============================================================
// Chat history & session management
// ============================================================

function createMessageId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createSystemMessage(text) {
  return { id: createMessageId('system'), role: 'system', text: String(text || '').trim(), ts: new Date().toISOString() };
}

function isBootstrapHistoryMessage(message) {
  return Boolean(message?.meta?.bootstrap);
}

function extractStablePreferences(messages) {
  const collected = [];
  for (const message of messages.filter((item) => !isBootstrapHistoryMessage(item))) {
    if (message.role !== 'user') continue;
    const text = normalizeLine(message.text, MAX_USER_PREFERENCE_LENGTH);
    if (!text || !PREFERENCE_KEYWORDS.test(text)) continue;
    collected.push(text);
  }
  return Array.from(new Set(collected)).slice(-MAX_STABLE_PREFERENCES);
}

function extractRecentTopics(messages) {
  const collected = [];
  for (const message of messages.filter((item) => !isBootstrapHistoryMessage(item)).slice(-MAX_RECENT_TURNS_FOR_SESSION)) {
    const text = normalizeLine(message.text, MAX_TOPIC_LENGTH);
    if (!text) continue;
    collected.push(text);
  }
  return collected.slice(-MAX_RECENT_TOPICS);
}

function buildConversationSummary(messages) {
  return messages
    .filter((item) => !isBootstrapHistoryMessage(item))
    .slice(-MAX_RECENT_TURNS_FOR_SUMMARY)
    .map((message) => `${message.role}: ${normalizeLine(message.text, 120)}`)
    .join(' | ')
    .slice(0, MAX_SUMMARY_LENGTH);
}

function rebuildNyxMemory(app, chatHistory) {
  const nyxMemory = {
    updatedAt: new Date().toISOString(),
    summary: buildConversationSummary(chatHistory),
    stablePreferences: extractStablePreferences(chatHistory),
    recentTopics: extractRecentTopics(chatHistory),
  };
  writeJsonFile(getNyxMemoryPath(app), nyxMemory);
  return nyxMemory;
}

function persistChatHistory(app, chatHistory) {
  writeJsonFile(getChatHistoryPath(app), chatHistory.slice(-MAX_CHAT_HISTORY));
  rebuildNyxMemory(app, chatHistory);
}

function appendHistoryMessage(app, chatHistory, message) {
  chatHistory.push(message);
  if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory = chatHistory.slice(-MAX_CHAT_HISTORY);
  persistChatHistory(app, chatHistory);
  return chatHistory;
}

function compactCurrentSessionHistory(app, chatHistory, chatSession, persistChatSessionFn) {
  if (chatHistory.length <= 8) return { ok: false, error: 'Session too short to compact.' };

  const preservedHead = chatHistory.slice(0, 1);
  const preservedTail = chatHistory.slice(-MAX_COMPACT_PRESERVE_TAIL);
  const middle = chatHistory.slice(1, -MAX_COMPACT_PRESERVE_TAIL);
  const summaryMessage = {
    id: createMessageId('system'),
    role: 'system',
    text: `Compaction summary: ${buildConversationSummary(middle) || 'No relevant content.'}`,
    ts: new Date().toISOString(),
    compacted: true,
  };

  chatHistory = [...preservedHead, summaryMessage, ...preservedTail].slice(-MAX_CHAT_HISTORY);
  persistChatSessionFn(app, { ...chatSession, compactionCount: Number(chatSession.compactionCount || 0) + 1 });
  persistChatHistory(app, chatHistory);
  return { ok: true, summaryMessage, chatHistory };
}

function resetChatSessionState(app, chatHistory, chatSession, persistChatSessionFn) {
  writeJsonFile(getChatHistoryPath(app), []);
  chatSession = { id: '', createdAt: '', lastUsedAt: '', compactionCount: 0 };
  persistChatSessionFn(app, chatSession);
  return { chatHistory: [], chatSession };
}

function startFreshSession(app, chatHistory, chatSession, acpSession, persistChatSessionFn, resetAcpSessionFn, appendSessionFlushFn, reason = 'manual-reset') {
  appendSessionFlushFn(chatHistory.slice(0, -1), reason);
  resetAcpSessionFn();
  return resetChatSessionState(app, chatHistory, chatSession, persistChatSessionFn);
}

function prepareChatSession(chatSession) {
  const now = new Date().toISOString();
  chatSession.id = chatSession.id || `session-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  chatSession.createdAt = chatSession.createdAt || now;
  chatSession.lastUsedAt = now;
  chatSession.compactionCount = Number(chatSession.compactionCount || 0);
  return chatSession;
}

function buildSessionMarkdownRecord(record = {}) {
  const messages = Array.isArray(record.messages) ? record.messages.filter((m) => m?.text) : [];
  const recentTurns = messages.slice(-MAX_RECENT_TURNS_FOR_SESSION).map((m) => `- ${String(m.role || 'unknown').toUpperCase()}: ${normalizeLine(m.text, MAX_SESSION_TURN_LENGTH)}`);
  return [
    '# SESSION', '', `- id: ${record.id || 'unknown'}`, `- created_at: ${record.createdAt || '-'}`,
    `- last_used_at: ${record.lastUsedAt || '-'}`, `- acp_session_id: ${record.acpSessionId || ''}`,
    `- message_count: ${Number(record.messageCount || messages.length || 0)}`, `- compaction_count: ${Number(record.compactionCount || 0)}`,
    '', '## Summary', '', record.summary || 'No relevant content.', '', '## Recent Turns', '',
    ...(recentTurns.length ? recentTurns : ['- none']), '',
  ].join('\n');
}

function persistCurrentSessionRecord(app, chatSession, chatHistory, acpSession) {
  const sessionsDir = getSessionsDirPath(app);
  ensureDirectory(sessionsDir);
  const record = {
    id: chatSession.id, createdAt: chatSession.createdAt, lastUsedAt: chatSession.lastUsedAt,
    compactionCount: Number(chatSession.compactionCount || 0), acpSessionId: acpSession.id || '',
    messageCount: chatHistory.length, summary: buildConversationSummary(chatHistory), messages: chatHistory,
  };
  writeJsonFile(getSessionRecordPath(app, chatSession.id), record);
  writeTextFile(getSessionMarkdownPath(app, chatSession.id), buildSessionMarkdownRecord(record), WORKSPACE_FILE_MAX_CHARS);
}

function appendSessionFlushToDailyMemory(app, messages, reason = 'manual') {
  const relevantMessages = Array.isArray(messages) ? messages.filter((m) => m?.text) : [];
  if (!relevantMessages.length) return null;

  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const dailyPath = path.join(getWorkspaceDailyMemoryPath(app), `${dateKey}.md`);
  const header = readTextFile(dailyPath, '').trim() ? '\n\n' : '# Daily Memory\n\n';
  const block = [
    `## ${now.toISOString()} | ${reason}`, '', `- Sessione: ${chatSession?.id || 'unknown'}`,
    `- Messaggi: ${relevantMessages.length}`, '', '### Summary', '',
    buildConversationSummary(relevantMessages) || 'No relevant content.', '',
    '### Recent Turns', '',
    ...relevantMessages.slice(-10).map((m) => `- ${String(m.role || 'unknown').toUpperCase()}: ${normalizeLine(m.text, MAX_SESSION_TURN_LENGTH)}`),
  ].join('\n');

  writeTextFile(dailyPath, `${readTextFile(dailyPath, '').trim()}${header}${block}\n`, WORKSPACE_FILE_MAX_CHARS);
  return dailyPath;
}

// ============================================================
// ACP session management
// ============================================================

function createEmptyAcpSession() {
  return { id: '', createdAt: '', lastUsedAt: '', turnCount: 0 };
}

function createEmptyChatSession() {
  return { id: '', createdAt: '', lastUsedAt: '', compactionCount: 0 };
}

function createEmptyMemory() {
  return { updatedAt: '', summary: '', stablePreferences: [], recentTopics: [] };
}

function syncAcpSessionToQwen(app, acpSession, sessionId, isNew) {
  if (!sessionId) return;
  const now = new Date().toISOString();
  acpSession.id = sessionId;
  acpSession.createdAt = (isNew || !acpSession.createdAt) ? now : acpSession.createdAt;
  acpSession.lastUsedAt = now;
  writeJsonFile(getAcpSessionPath(app), acpSession);
}

function markAcpSessionTurnCompleted(app, acpSession, sessionId) {
  if (!sessionId || acpSession.id !== sessionId) return;
  acpSession.turnCount = Math.max(0, Number(acpSession.turnCount || 0)) + 1;
  acpSession.lastUsedAt = new Date().toISOString();
  writeJsonFile(getAcpSessionPath(app), acpSession);
}

function resetAcpSession(app, acpSession, sessionId = '') {
  if (sessionId && acpSession.id && acpSession.id !== sessionId) return;
  Object.assign(acpSession, createEmptyAcpSession());
  writeJsonFile(getAcpSessionPath(app), acpSession);
}

function prepareAcpSessionTurn(app, acpSession) {
  const now = new Date().toISOString();
  const isNew = !acpSession.id;
  acpSession.id = acpSession.id || require('crypto').randomUUID();
  acpSession.createdAt = acpSession.createdAt || now;
  acpSession.lastUsedAt = now;
  writeJsonFile(getAcpSessionPath(app), acpSession);
  return { id: acpSession.id, isNew };
}

// ============================================================
// Bootstrap management
// ============================================================

function createDefaultBootstrapState() {
  return { active: false, startedAt: null, updatedAt: null, stepIndex: 0, currentPrompt: '', answers: {} };
}

function isBootstrapAnswerEmpty(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || BOOTSTRAP_EMPTY_VALUES.has(normalized);
}

function getBootstrapMissingFieldIds(answers = {}) {
  return BOOTSTRAP_FIELDS.filter((f) => isBootstrapAnswerEmpty(answers[f.id])).map((f) => f.id);
}

function buildBootstrapFollowUpPrompt(fieldIds = []) {
  const fields = BOOTSTRAP_FIELDS.filter((f) => fieldIds.includes(f.id));
  if (!fields.length) return '';
  return `Still need: ${fields.map((f) => f.label).join(', ')}. Please answer in a single sentence.`;
}

function parseBootstrapReasoning(reasoning = '') {
  const result = { answers: {}, missingIds: [], status: 'collecting', nextPrompt: '' };
  const validFieldIds = new Set(BOOTSTRAP_FIELDS.map((f) => f.id));

  for (const rawLine of String(reasoning || '').split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[-*]\s*/, '').trim();
    if (!line || /^bootstrap_capture:?$/i.test(line)) continue;
    const match = line.match(/^([a-z_]+)\s*=\s*(.*)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (validFieldIds.has(key)) { if (!isBootstrapAnswerEmpty(value)) result.answers[key] = value; continue; }
    if (key === 'missing') {
      result.missingIds = value.toLowerCase() === 'none' ? [] : value.split(',').map((i) => i.trim()).filter((i) => validFieldIds.has(i));
      continue;
    }
    if (key === 'status') { result.status = /complete/i.test(value) ? 'complete' : 'collecting'; continue; }
    if (key === 'next_prompt') { result.nextPrompt = value; }
  }
  return result;
}

function getBootstrapInitialPrompt() {
  return [
    'Initial setup.',
    'In a single reply, tell me: what you want to call the assistant, how you want it to address you, what role it should have, what tone it should use, any constraints it should follow, which tools or workflows it should prefer, and which projects or contexts it should keep in mind.',
    'If any point does not apply, just write none or leave it open.',
  ].join(' ');
}

function buildBootstrapAnswersPrompt(bootstrapState) {
  const answers = bootstrapState.answers || {};
  const sections = BOOTSTRAP_FIELDS.map((field) => {
    const value = String(answers[field.id] || '').trim();
    if (isBootstrapAnswerEmpty(value)) return '';
    return `- ${field.id}: ${normalizeLine(value, 280)}`;
  }).filter(Boolean);
  return sections.length ? `BOOTSTRAP_ANSWERS:\n${sections.join('\n')}` : '';
}

function updateBootstrapStateFromAcp(bootstrapState, reasoning = '', options = {}) {
  const parsed = parseBootstrapReasoning(reasoning);
  const mergedAnswers = { ...(bootstrapState.answers || {}), ...(parsed.answers || {}) };
  const missingIds = parsed.missingIds.length ? parsed.missingIds : getBootstrapMissingFieldIds(mergedAnswers);
  const completed = parsed.status === 'complete' || !missingIds.length;

  if (completed) {
    bootstrapState.answers = mergedAnswers;
    bootstrapState.active = false;
    bootstrapState.currentPrompt = '';
    bootstrapState.updatedAt = new Date().toISOString();
    bootstrapState.stepIndex = Math.max(1, Number(bootstrapState.stepIndex || 0) + 1);
    return { completed: true };
  }

  const fallbackPrompt = options.mode === 'start' ? getBootstrapInitialPrompt() : buildBootstrapFollowUpPrompt(missingIds);
  const nextPrompt = normalizeLine(parsed.nextPrompt || fallbackPrompt, 320) || fallbackPrompt;
  bootstrapState.active = true;
  bootstrapState.answers = mergedAnswers;
  bootstrapState.currentPrompt = nextPrompt;
  bootstrapState.updatedAt = new Date().toISOString();
  bootstrapState.stepIndex = Math.max(1, Number(bootstrapState.stepIndex || 0) + 1);
  return { completed: false, nextPrompt };
}

function applyBootstrapAnswersToWorkspace(app, bootstrapState) {
  const answers = bootstrapState.answers || {};
  const assistantName = normalizeLine(answers.assistant_name || '', 120) || 'Nyx';
  const preferredName = normalizeLine(answers.preferred_name || '', 140) || String(process.env.USERNAME || 'user').trim() || 'user';
  const nyxRole = normalizeLine(answers.nyx_role || '', 220) || 'technical and operational assistant';
  const toneStyle = normalizeLine(answers.tone_style || '', 220) || 'direct, concise, concrete';
  const boundaries = normalizeLine(answers.boundaries || '', 280) || 'avoid filler, emphatic tone, unnecessary markdown, and unverified promises';
  const toolPreferences = normalizeLine(answers.tool_preferences || '', 280) || (ENABLE_LIVE_CANVAS ? 'use browser and canvas when they add real value' : 'use browser and computer use when they add real value');
  const focusContext = normalizeLine(answers.focus_context || '', 280) || 'local desktop workspace and user ACP workflows';

  writeTextFile(getWorkspaceFilePath(app, 'USER.md'), ['# USER', '', `- Preferred name: ${preferredName}`, `- Primary context: ${focusContext}`, '- Update this file with durable preferences and stable personal instructions.'].join('\n'), WORKSPACE_FILE_MAX_CHARS);
  writeTextFile(getWorkspaceFilePath(app, 'IDENTITY.md'), ['# IDENTITY', '', `- Name: ${assistantName}`, ENABLE_LIVE_CANVAS ? '- Type: desktop avatar with chat, canvas, and browser' : '- Type: desktop avatar with chat, browser, and computer use', `- Default role: ${nyxRole}`].join('\n'), WORKSPACE_FILE_MAX_CHARS);
  writeTextFile(getWorkspaceFilePath(app, 'SOUL.md'), ['# SOUL', '', `${assistantName} is a pragmatic, clear-headed, and concrete desktop avatar.`, `Style: ${toneStyle}.`, `Constraints: ${boundaries}.`].join('\n'), WORKSPACE_FILE_MAX_CHARS);
  writeTextFile(getWorkspaceFilePath(app, 'AGENTS.md'), ['# AGENTS', '', `- Primary operational role: ${nyxRole}.`, `- Required tone: ${toneStyle}.`, `- Default context: ${focusContext}.`, `- Hard constraints: ${boundaries}.`, '- If a stable preference emerges, suggest saving it to the workspace.'].join('\n'), WORKSPACE_FILE_MAX_CHARS);
  writeTextFile(getWorkspaceFilePath(app, 'TOOLS.md'), ['# TOOLS', '', '- Direct ACP via Qwen CLI with session resume.', '- Real browser via PinchTab.', ...(ENABLE_LIVE_CANVAS ? ['- Side canvas for text, clipboard, files, images, video, and audio.'] : ['- Real computer use for windows, controls, and desktop input.']), `- Usage preferences: ${toolPreferences}.`].join('\n'), WORKSPACE_FILE_MAX_CHARS);
}

function completeWorkspaceBootstrap(app) {
  const bootstrapPath = getWorkspaceFilePath(app, 'BOOTSTRAP.md');
  if (fs.existsSync(bootstrapPath)) fs.rmSync(bootstrapPath, { force: true });
  return { ok: true, message: 'Bootstrap complete. BOOTSTRAP.md removed from workspace.' };
}

// ============================================================
// Local chat commands
// ============================================================

async function runLocalChatCommand(app, text, chatHistory, chatSession, acpSession, bootstrapState, workspaceState, completeWorkspaceBootstrapFn, openWorkspaceFolderFn, appendSessionFlushFn, compactCurrentSessionHistoryFn, startFreshSessionFn, resetAcpSessionFn) {
  const rawInput = String(text || '').trim();
  const input = rawInput.toLowerCase();

  if (input === '/bootstrap done') {
    const result = completeWorkspaceBootstrapFn(app);
    return { message: createSystemMessage(result.message), replaceHistory: false };
  }
  if (input === '/bootstrap status') {
    const currentQuestion = bootstrapState.active ? String(bootstrapState.currentPrompt || '').trim() : '';
    return { message: createSystemMessage([`Bootstrap active: ${bootstrapState.active ? 'yes' : 'no'}`, `Bootstrap pending: ${workspaceState.bootstrapPending ? 'yes' : 'no'}`, `Round: ${Number(bootstrapState.stepIndex || 0)}`, currentQuestion ? `Current question: ${currentQuestion}` : 'Current question: none'].join('\n')), replaceHistory: false };
  }
  if (input === '/workspace open') {
    const result = await openWorkspaceFolderFn(app);
    return { message: createSystemMessage(result.message), replaceHistory: false };
  }
  if (input === '/workspace status') {
    return { message: createSystemMessage(createWorkspaceStatusText(app, workspaceState, chatSession, chatHistory)), replaceHistory: false };
  }
  if (input === '/memory flush') {
    const flushedPath = appendSessionFlushFn(chatHistory.slice(0, -1), 'manual-flush');
    return { message: createSystemMessage(flushedPath ? `Session saved to ${path.relative(getWorkspacePath(app), flushedPath).replace(/\\/g, '/')}.` : 'No useful content to save to memory/YYYY-MM-DD.md.'), replaceHistory: false };
  }
  if (input.startsWith('/memory search ')) {
    const query = rawInput.slice('/memory search '.length).trim();
    const results = runMemorySearch(app, query, { maxResults: MEMORY_SEARCH_MAX_RESULTS });
    return { message: createSystemMessage(results.length ? `Memory search:\n${results.map((item, i) => `${i + 1}. ${item.path}\n${item.snippet}`).join('\n\n')}` : 'No results in MEMORY.md or daily notes.'), replaceHistory: false };
  }
  if (input.startsWith('/memory get ')) {
    const args = rawInput.slice('/memory get '.length).trim().split(/\s+/);
    const result = runMemoryGet(app, args[0] || '', args[1] || 1, args[2] || 40);
    return { message: createSystemMessage(result.ok ? `${result.path}:${result.startLine}-${result.endLine}\n${result.text || '[empty]'}` : result.error), replaceHistory: false };
  }
  if (input === '/session status') {
    return { message: createSystemMessage([`Session: ${chatSession.id || 'none'}`, `Created: ${chatSession.createdAt || '-'}`, `Last used: ${chatSession.lastUsedAt || '-'}`, `Messages: ${chatHistory.length}`, `Compactions: ${Number(chatSession.compactionCount || 0)}`, `ACP session: ${acpSession.id || 'none'}`].join('\n')), replaceHistory: false };
  }
  if (input.startsWith('/session search ')) {
    const query = rawInput.slice('/session search '.length).trim();
    const results = runSessionSearch(app, query, { maxResults: SESSION_SEARCH_MAX_RESULTS });
    return { message: createSystemMessage(results.length ? `Session search:\n${results.map((item, i) => `${i + 1}. ${item.id} (${item.updatedAt || 'n/a'})\n${item.snippet}`).join('\n\n')}` : 'No saved sessions match the query.'), replaceHistory: false };
  }
  if (input === '/compact') {
    const result = compactCurrentSessionHistoryFn(app, chatHistory, chatSession);
    return { message: createSystemMessage(result.ok ? 'Session compacted. Replaced the middle section with a persistent summary.' : result.error), replaceHistory: true };
  }
  if (input === '/new' || input === '/reset') {
    startFreshSessionFn(app, chatHistory, chatSession, acpSession, 'new-session');
    return { message: createSystemMessage('Session reset. Transcript flushed to daily note and local context cleared.'), replaceHistory: true };
  }
  return null;
}

function createWorkspaceStatusText(app, workspaceState, chatSession, chatHistory) {
  const fileSummary = workspaceState.files.filter((f) => f.exists).map((f) => f.name).join(', ');
  return [
    `Workspace: ${workspaceState.path}`, `Sessions dir: ${getSessionsDirPath(app)}`,
    `Bootstrap pending: ${workspaceState.bootstrapPending ? 'yes' : 'no'}`,
    `BOOT active on next prompt: ${workspaceState.startupBootPending ? 'yes' : 'no'}`,
    `Local session: ${chatSession.id || 'none'}`,
    chatSession.id ? `Session markdown: ${getSessionMarkdownPath(app, chatSession.id)}` : 'Session markdown: none',
    `Messages in session: ${chatHistory.length}`, `Compactions: ${Number(chatSession.compactionCount || 0)}`,
    workspaceState.memoryFile ? `Long-term memory: ${workspaceState.memoryFile}` : 'Long-term memory: none',
    workspaceState.dailyNotes.length ? `Daily notes: ${workspaceState.dailyNotes.map((n) => n.relativePath).join(', ')}` : 'Daily notes: none',
    fileSummary ? `Files present: ${fileSummary}` : 'Files present: none',
  ].join('\n');
}

function runMemoryGet(app, requestPath, startLine = 1, lineCount = 40) {
  const trimmedRequestPath = String(requestPath || '').trim().replace(/^[/\\]+/, '');
  if (!trimmedRequestPath) return { ok: false, error: 'Memory file not found in workspace.' };
  const workspacePath = resolveWorkspacePath(app, requestPath);
  if (!workspacePath) return { ok: false, error: 'Path is outside the workspace.' };
  const { resolved, workspaceRoot } = workspacePath;
  if (!fs.existsSync(resolved)) return { ok: false, error: 'Memory file not found in workspace.' };

  const lines = readTextFile(resolved, '').split(/\r?\n/);
  const from = Math.max(1, Number(startLine) || 1);
  const count = Math.max(1, Math.min(200, Number(lineCount) || 40));
  const excerpt = lines.slice(from - 1, from - 1 + count);
  return { ok: true, path: path.relative(workspaceRoot, resolved).replace(/\\/g, '/'), startLine: from, endLine: from + excerpt.length - 1, text: excerpt.join('\n').trim() };
}

function resolveWorkspaceRequestPath(app, requestPath = '') {
  return resolveWorkspacePath(app, requestPath)?.resolved || null;
}

module.exports = {
  // Paths
  getWorkspacePath,
  getWorkspaceDailyMemoryPath,
  getWorkspaceFilePath,
  getSessionsDirPath,
  getLegacySessionsDirPath,
  getSessionRecordPath,
  getSessionMarkdownPath,
  getChatHistoryPath,
  getNyxMemoryPath,
  getAcpSessionPath,
  getChatSessionPath,
  getBootstrapStatePath,
  getAppFilePath,

  // File I/O
  readJsonFile,
  writeJsonFile,
  readTextFile,
  writeTextFile,
  ensureDirectory,
  resolveWorkspacePath,

  // Workspace
  getWorkspaceMemoryFileName,
  listRecentDailyMemoryNotes,
  extractMeaningfulMarkdownLines,
  hasMeaningfulMarkdownContent,
  buildDefaultWorkspaceFiles,
  ensureWorkspaceBootstrap,
  readWorkspaceState,
  buildWorkspaceProjectContextPrompt,
  buildRecentDailyMemoryPrompt,
  applyWorkspaceUpdate,
  buildWorkspaceSavedMessage,
  completeWorkspaceBootstrap,
  applyBootstrapAnswersToWorkspace,
  createWorkspaceStatusText,

  // Memory search
  runMemorySearch,
  runSessionSearch,
  runMemoryGet,
  resolveWorkspaceRequestPath,

  // Chat history
  createMessageId,
  createSystemMessage,
  isBootstrapHistoryMessage,
  extractStablePreferences,
  extractRecentTopics,
  buildConversationSummary,
  rebuildNyxMemory,
  persistChatHistory,
  appendHistoryMessage,
  compactCurrentSessionHistory,
  resetChatSessionState,
  startFreshSession,
  prepareChatSession,
  buildSessionMarkdownRecord,
  persistCurrentSessionRecord,
  appendSessionFlushToDailyMemory,

  // ACP session
  createEmptyAcpSession,
  createEmptyChatSession,
  createEmptyMemory,
  syncAcpSessionToQwen,
  markAcpSessionTurnCompleted,
  resetAcpSession,
  prepareAcpSessionTurn,

  // Bootstrap
  createDefaultBootstrapState,
  isBootstrapAnswerEmpty,
  getBootstrapMissingFieldIds,
  buildBootstrapFollowUpPrompt,
  parseBootstrapReasoning,
  getBootstrapInitialPrompt,
  buildBootstrapAnswersPrompt,
  updateBootstrapStateFromAcp,

  // Local commands
  runLocalChatCommand,

  // Utilities
  normalizeLine,
  truncatePromptText,
  truncateWithMarker,
  normalizeSpeechText,
};
