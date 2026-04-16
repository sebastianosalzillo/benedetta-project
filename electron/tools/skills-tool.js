/**
 * @fileoverview Skills tool wrapper — adapts existing skills.js to AgentTool interface.
 * Skills are dynamically loaded from the skills/ directory.
 * This tool exposes skill matching and execution as a unified AgentTool.
 *
 * @module tools/skills-tool
 */

const {
  loadSkills,
  matchSkill,
  executeSkill,
  listSkills,
} = require('../skills');

// Cache loaded skills — reload on demand
let _loadedSkills = null;

/**
 * Reload skills from the skills/ directory.
 * @param {boolean} [force]
 * @returns {Array}
 */
function getSkills(force = false) {
  if (!_loadedSkills || force) {
    _loadedSkills = loadSkills();
  }
  return _loadedSkills;
}

/**
 * AgentTool for skill discovery and execution.
 * This is a meta-tool — it matches user input to skills and runs them.
 * @type {import('../agent/types').AgentTool}
 */
const skillsTool = {
  name: 'skills',
  label: 'Plugin Skills',
  description:
    'Execute a plugin skill based on user input. Skills are loaded from the skills/ directory. ' +
    'Use "list" action to see available skills, or provide text to auto-match and execute.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'match_and_run'],
        description: 'Action: "list" shows available skills, "match_and_run" auto-matches text',
      },
      text: {
        type: 'string',
        description: 'User input text to match against skills (for "match_and_run")',
      },
    },
    required: ['action'],
    additionalProperties: false,
  },

  /**
   * @param {string} _toolCallId
   * @param {{action: string, text?: string}} args
   * @param {AbortSignal} [_signal]
   * @param {function} [_onUpdate]
   * @returns {Promise<import('../agent/types').AgentToolResult>}
   */
  async execute(_toolCallId, args, _signal, _onUpdate) {
    const skills = getSkills(true); // Always reload to catch new/changed skills

    if (args.action === 'list') {
      const listed = listSkills(skills);
      if (listed.length === 0) {
        return { content: 'No skills installed. Drop .js files into the skills/ directory.', details: listed };
      }
      const lines = listed.map((s) =>
        `  **${s.name}** (${s.id})\n    ${s.description || 'No description'}\n    Priority: ${s.priority}, Enabled: ${s.enabled}`
      ).join('\n\n');
      return {
        content: `${listed.length} skill(s) available:\n\n${lines}`,
        details: listed,
      };
    }

    if (args.action === 'match_and_run') {
      if (!args.text) {
        return { content: 'Error: "text" parameter required for match_and_run action', isError: true };
      }

      const matchedSkill = matchSkill(skills, args.text);
      if (!matchedSkill) {
        return {
          content: `No skill matched for: "${args.text}". Use "list" action to see available skills.`,
          details: { input: args.text, matched: null },
        };
      }

      try {
        const result = await executeSkill(matchedSkill, {
          text: args.text,
          skills: skills,
        });

        if (!result.ok) {
          return {
            content: `Skill "${matchedSkill.name}" error: ${result.error}`,
            details: result,
            isError: true,
          };
        }

        return {
          content: `Skill "${matchedSkill.name}" executed successfully.\n\nResult: ${JSON.stringify(result.result, null, 2)}`,
          details: result,
        };
      } catch (err) {
        return {
          content: `Skill "${matchedSkill.name}" execution error: ${err.message}`,
          isError: true,
        };
      }
    }

    return { content: `Unknown action: ${args.action}`, isError: true };
  },
};

module.exports = {
  skillsTool,
  getSkills,
};
