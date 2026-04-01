const { registerHook, emitHook, HOOK_EVENTS } = require('./hooks');
const { smartPrune, getContextStats, MAX_CONTEXT_TOKENS } = require('./session-pruning');
const { loadSkills, matchSkill, executeSkill, listSkills } = require('./skills');

let loadedSkills = [];

function initializeHooks() {
  loadedSkills = loadSkills();

  registerHook(HOOK_EVENTS.CHAT_BEFORE, async (payload) => {
    const { userText } = payload;
    const skill = matchSkill(loadedSkills, userText);
    if (skill) {
      const result = await executeSkill(skill, { text: userText, ...payload });
      if (result.ok) {
        return { skipAgentLoop: true, response: result.result };
      }
    }
  }, { priority: 100 });

  registerHook(HOOK_EVENTS.TOOL_BEFORE, async (payload) => {
    const { tool, args } = payload;
    const dangerousTools = ['shell', 'write_file', 'edit_file', 'apply_patch', 'git'];
    if (dangerousTools.includes(tool)) {
      return { requiresApproval: true, tool, args };
    }
  }, { priority: 50 });

  registerHook(HOOK_EVENTS.AGENT_TURN_END, async (payload) => {
    const { chatHistory } = payload;
    const result = smartPrune(chatHistory);
    if (result.action !== 'none') {
      return { pruned: result.pruned, action: result.action, stats: getContextStats(chatHistory) };
    }
  }, { priority: 0 });

  registerHook(HOOK_EVENTS.CONTEXT_PRUNE, async (payload) => {
    const { chatHistory, maxTokens } = payload;
    const result = smartPrune(chatHistory, { maxTokens: maxTokens || MAX_CONTEXT_TOKENS });
    return result;
  }, { priority: 0 });
}

function getHooksStatus() {
  const { registerHook, listHooks } = require('./hooks');
  return {
    hooks: listHooks(),
    skills: listSkills(loadedSkills),
    contextStats: require('./session-pruning').getContextStats([]),
  };
}

module.exports = {
  initializeHooks,
  getHooksStatus,
  HOOK_EVENTS,
};
