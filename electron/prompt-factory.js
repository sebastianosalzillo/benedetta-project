const path = require('path');
const fs = require('fs');
const {
  WORKSPACE_REQUIRED_FILES,
  MAX_INITIAL_PROMPT_HISTORY,
  WORKSPACE_FILE_MAX_CHARS,
  WORKSPACE_TOTAL_MAX_CHARS,
} = require('./constants');
const {
  getWorkspacePath,
  getWorkspaceFilePath,
  getWorkspaceMemoryFileName,
  readTextFile,
  normalizeLine,
  truncatePromptText,
  buildWorkspaceProjectContextPrompt: wmBuildWorkspaceProjectContextPrompt,
  buildRecentDailyMemoryPrompt: wmBuildRecentDailyMemoryPrompt,
  getBootstrapInitialPrompt,
  buildBootstrapAnswersPrompt,
} = require('./workspace-manager');
const { buildProjectContextPrompt, buildMemoryContextPrompt } = require('./project-context');

const SYSTEM_PROMPT_TEMPLATE = fs.readFileSync(path.join(__dirname, 'prompts', 'system_prompt.md'), 'utf-8');
const BOOTSTRAP_PROMPT_TEMPLATE = fs.readFileSync(path.join(__dirname, 'prompts', 'bootstrap_prompt.md'), 'utf-8');

function buildDirectAgentPrompt(userText, context = {}) {
  const {
    app = null,
    chatHistory = [],
    nyxMemory = {},
    agentSession = {},
    personalityState = {},
    getPersonalityPrompt,
    buildBrowserStatePrompt: buildBrowserStatePromptCtx,
    buildComputerStatePrompt: buildComputerStatePromptCtx,
    workspaceState = {},
    chatSession = {},
    canvasState = {},
    computerState = {}
  } = context;

  const normalizedUserText = String(userText || '').trim();
  const promptHistory = chatHistory.filter((item) => item.role !== 'system');

  const historyBlock = promptHistory
    .slice(-MAX_INITIAL_PROMPT_HISTORY)
    .map((item) => `${item.role.toUpperCase()}: ${normalizeLine(item.text, 180)}`)
    .join('\n');

  const preferencesBlock = (nyxMemory.stablePreferences || [])
    .map((line) => `- ${line}`)
    .join('\n');

  const topicsBlock = (nyxMemory.recentTopics || [])
    .map((line) => `- ${line}`)
    .join('\n');

  const browserBlock = buildBrowserStatePrompt({ canvasState });
  const computerBlock = buildComputerStatePrompt({ computerState });
  const sessionContextBlock = buildCurrentSessionContextPrompt(context);
  const memoryFileName = getWorkspaceMemoryFileName(app);

  const projectContextBlock = buildProjectContextPrompt(app, { privateSession: true });
  const memoryContextBlock = buildMemoryContextPrompt(app, { privateSession: true });

  const startupBootBlock = buildStartupBootPrompt(context);
  const dailyMemoryBlock = wmBuildRecentDailyMemoryPrompt(app, 2);

  return [
    SYSTEM_PROMPT_TEMPLATE.replace('{{WORKSPACE_ROOT}}', `Workspace root: ${getWorkspacePath(app)}`),
    '',
    projectContextBlock,
    memoryContextBlock,
    startupBootBlock,
    sessionContextBlock,
    nyxMemory.summary ? `MEMORY_SUMMARY:\n${nyxMemory.summary}` : '',
    agentSession.id ? `AGENT_SESSION:\n- id: ${agentSession.id}\n- turns: ${agentSession.turnCount || 0}` : '',
    preferencesBlock ? `USER_PREFERENCES:\n${preferencesBlock}` : '',
    topicsBlock ? `RECENT_TOPICS:\n${topicsBlock}` : '',
    dailyMemoryBlock,
    browserBlock ? browserBlock : '',
    computerBlock,
    getPersonalityPrompt ? getPersonalityPrompt(personalityState) : '',
    !agentSession.turnCount && historyBlock ? `RECENT_HISTORY:\n${historyBlock}` : '',
    `USER_INPUT: ${normalizedUserText}`,
  ].filter(Boolean).join('\n\n');
}

function buildBootstrapAgentPrompt(userText, options = {}, context = {}) {
  const { app = null, bootstrapState } = context;
  const normalizedUserText = String(userText || '').trim();
  const bootstrapAnswerBlock = buildBootstrapAnswersPrompt(bootstrapState);

  const projectContextBlock = buildProjectContextPrompt(app, { privateSession: false });

  const workspacePath = app ? getWorkspacePath(app) : 'workspace/';

  return [
    BOOTSTRAP_PROMPT_TEMPLATE,
    '',
    `WORKSPACE_PATH: ${workspacePath}`,
    projectContextBlock,
    bootstrapAnswerBlock,
    options.mode === 'start' ? getBootstrapInitialPrompt() : '',
    `USER_INPUT: ${normalizedUserText}`,
  ].filter(Boolean).join('\n\n');
}

function buildCurrentSessionContextPrompt(context = {}) {
  const { chatSession = {}, agentSession = {} } = context;
  const lines = [];
  if (chatSession.id) {
    lines.push(`SESSION_ID: ${chatSession.id}`);
    lines.push(`SESSION_CREATED: ${chatSession.createdAt || '-'}`);
    lines.push(`SESSION_LAST_USED: ${chatSession.lastUsedAt || '-'}`);
    lines.push(`SESSION_TURNS: ${agentSession.turnCount || 0}`);
    lines.push(`SESSION_COMPACTIONS: ${Number(chatSession.compactionCount || 0)}`);
  }
  return lines.length ? `CURRENT_SESSION:\n${lines.join('\n')}` : '';
}

function buildStartupBootPrompt(context = {}) {
  const { workspaceState = {} } = context;
  if (!workspaceState.startupBootPending && !workspaceState.bootstrapPending) return '';
  return [
    'STARTUP_BOOT: attivo.',
    workspaceState.bootstrapPending ? '- Completa il bootstrap del workspace se non fatto.' : '',
    workspaceState.startupBootPending ? '- Applica le istruzioni dal file BOOT.md.' : '',
  ].filter(Boolean).join('\n');
}

function buildBrowserStatePrompt(context = {}) {
  const { canvasState = {} } = context;
  if (canvasState.content?.type !== 'browser') {
    return '';
  }

  const browser = canvasState.content;
  const refLines = (browser.snapshotItems || [])
    .slice(0, 20)
    .map((item) => `- ${item.ref || 'node'} | ${item.role || 'node'} | ${normalizeLine(item.label, 140)}`)
    .join('\n');

  return [
    'ACTIVE_BROWSER:',
    browser.tabId ? `TAB_ID: ${browser.tabId}` : '',
    `URL: ${browser.currentUrl || browser.url || ''}`,
    `TITLE: ${browser.pageTitle || browser.title || 'Browser'}`,
    `STATUS: ${browser.status || 'idle'}`,
    browser.text ? `TEXT_PREVIEW: ${normalizeLine(browser.text, 700)}` : '',
    refLines ? `INTERACTIVE_REFS:\n${refLines}` : 'INTERACTIVE_REFS:\n- none',
  ].filter(Boolean).join('\n');
}

function buildComputerStatePrompt(context = {}) {
  const { computerState = {} } = context;
  if (!computerState.supported) {
    return 'ACTIVE_COMPUTER:\nSUPPORTED: no';
  }

  const windowLines = (computerState.windows || [])
    .slice(0, 10)
    .map((item) => `- ${normalizeLine(item.title, 80)}${item.process ? ` | ${item.process}` : ''}`)
    .join('\n');

  const foregroundBounds = computerState.foregroundBounds
    && Number.isFinite(Number(computerState.foregroundBounds.width))
    && Number.isFinite(Number(computerState.foregroundBounds.height))
    ? `${Math.round(Number(computerState.foregroundBounds.x || 0))},${Math.round(Number(computerState.foregroundBounds.y || 0))},${Math.round(Number(computerState.foregroundBounds.width || 0))},${Math.round(Number(computerState.foregroundBounds.height || 0))}`
    : '';

  const interactiveElementLines = (computerState.interactiveElements || [])
    .slice(0, 12)
    .map((item) => {
      const parts = [
        `controlId=${item.controlId}`,
        item.elementType || '',
        item.title ? `"${normalizeLine(item.title, 48)}"` : '',
        item.autoId ? `autoId=${normalizeLine(item.autoId, 32)}` : '',
        item.className ? `class=${normalizeLine(item.className, 24)}` : '',
      ].filter(Boolean);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');

  return [
    'ACTIVE_COMPUTER:',
    'SUPPORTED: yes',
    `DESKTOP_BACKEND: ${computerState.desktopBackend || 'native'}`,
    `PRIMARY_SCREEN: ${computerState.width || 0}x${computerState.height || 0}`,
    `CURSOR: ${computerState.cursorX || 0},${computerState.cursorY || 0}`,
    `FOREGROUND_WINDOW: ${computerState.foregroundTitle || '-'}`,
    computerState.foregroundProcess ? `FOREGROUND_PROCESS: ${computerState.foregroundProcess}` : '',
    foregroundBounds ? `FOREGROUND_BOUNDS: ${foregroundBounds}` : '',
    windowLines ? `VISIBLE_WINDOWS:\n${windowLines}` : 'VISIBLE_WINDOWS:\n- none',
    interactiveElementLines ? `INTERACTIVE_ELEMENTS:\n${interactiveElementLines}` : '',
    computerState.lastResult ? `LAST_RESULT: ${normalizeLine(computerState.lastResult, 220)}` : '',
    `OCR_STATUS: ${computerState.ocrStatus || 'idle'}`,
    computerState.error ? `ERROR: ${normalizeLine(computerState.error, 220)}` : '',
  ].filter(Boolean).join('\n');
}

function formatToolListForSpeech(tools = []) {
  const uniqueTools = Array.from(new Set((Array.isArray(tools) ? tools : []).map((tool) => String(tool || '').trim()).filter(Boolean)));
  if (!uniqueTools.length) return 'gli strumenti richiesti';
  if (uniqueTools.length === 1) return uniqueTools[0];
  if (uniqueTools.length === 2) return `${uniqueTools[0]} e ${uniqueTools[1]}`;
  return `${uniqueTools.slice(0, -1).join(', ')} e ${uniqueTools[uniqueTools.length - 1]}`;
}

function buildAutoToolBatchStartText(actionCalls = [], dataToolCalls = []) {
  const tools = [...actionCalls, ...dataToolCalls].map((c) => c.type);
  if (!tools.length) return '';
  const list = formatToolListForSpeech(tools);
  return `Eseguo ${list}.`;
}

function buildAutoToolBatchCompleteText(results = []) {
  if (!results.length) return '';
  const ok = results.filter(r => r.ok).map(r => r.type);
  const err = results.filter(r => !r.ok).map(r => r.type);

  if (err.length) {
    return `Completato con errori in ${formatToolListForSpeech(err)}.`;
  }
  return `Completato.`;
}

function buildToolResultPrompt(results = [], userText = '') {
  if (!results.length) return '';
  const okCount = results.filter((res) => res.ok).length;
  const errorCount = results.length - okCount;
  const sections = results.map((res) => {
    const status = res.ok ? 'SUCCESS' : 'ERROR';
    const content = JSON.stringify(res, null, 2);
    return `[TOOL: ${res.type}] [STATUS: ${status}]\n${content}`;
  });
  const guidance = okCount && errorCount
    ? 'PARTIAL_SUCCESS: alcuni tool sono falliti, ma usa prima i risultati riusciti. Se bastano per rispondere, rispondi direttamente senza tentare altri fallback rumorosi.'
    : '';
  return [guidance, ...sections].filter(Boolean).join('\n\n');
}

module.exports = {
  buildDirectAgentPrompt,
  buildBootstrapAgentPrompt,
  buildCurrentSessionContextPrompt,
  buildStartupBootPrompt,
  buildBrowserStatePrompt,
  buildComputerStatePrompt,
  buildAutoToolBatchStartText,
  buildAutoToolBatchCompleteText,
  buildToolResultPrompt,
  formatToolListForSpeech,
};
