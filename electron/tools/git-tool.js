/**
 * @fileoverview Git tool wrapper — adapts existing git-tool.js to AgentTool interface.
 *
 * @module tools/git-tool
 */

const { gitHandleAction } = require('../git-tool');

/**
 * Helper to format git result as text.
 */
function formatGitResult(result, action) {
  if (!result.ok) {
    return { content: `Error (${action}): ${result.error || result.stderr}`, isError: true };
  }

  switch (action) {
    case 'status': {
      if (!result.files || result.files.length === 0) {
        return { content: `Branch: ${result.branch || 'unknown'}\n\nWorking tree clean.`, details: result };
      }
      const files = result.files.map((f) => `  ${f.status}: ${f.path}`).join('\n');
      return { content: `Branch: ${result.branch || 'unknown'}\n\n${files}`, details: result };
    }
    case 'log': {
      const lines = (result.stdout || '').split('\n').map((l) => {
        const [hash, author, _email, date, ...rest] = l.split('|');
        return `  ${hash} ${date} — ${author}: ${rest.join('|')}`;
      }).join('\n');
      return { content: lines || 'No commits found.', details: result };
    }
    case 'diff': {
      return { content: result.stdout || 'No changes.', details: result };
    }
    case 'branch': {
      return { content: result.stdout || 'No branches.', details: result };
    }
    case 'remote': {
      return { content: result.stdout || 'No remotes configured.', details: result };
    }
    default: {
      return { content: result.stdout || `${action} completed.`, details: result };
    }
  }
}

/**
 * Generic git command tool.
 * @type {import('../agent/types').AgentTool}
 */
const gitTool = {
  name: 'git',
  label: 'Git Command',
  description:
    'Execute git commands. Supports: status, diff, log, add, commit, branch, ' +
    'checkout, create_branch, stash, stash_pop, pull, push, remote.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'status', 'diff', 'log', 'add', 'commit',
          'branch', 'checkout', 'create_branch',
          'stash', 'stash_pop', 'pull', 'push', 'remote',
        ],
        description: 'Git action to perform',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Files to stage (for "add" action)',
      },
      message: {
        type: 'string',
        description: 'Commit message (for "commit" action)',
      },
      branch: {
        type: 'string',
        description: 'Branch name (for "checkout"/"create_branch" actions)',
      },
      staged: {
        type: 'boolean',
        description: 'Show staged diff (for "diff" action)',
      },
      limit: {
        type: 'number',
        description: 'Number of log entries (for "log" action, default: 20)',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (default: current directory)',
      },
    },
    required: ['action'],
    additionalProperties: false,
  },

  /**
   * @param {string} _toolCallId
   * @param {Object} args
   * @param {AbortSignal} [_signal]
   * @returns {Promise<import('../agent/types').AgentToolResult>}
   */
  async execute(_toolCallId, args, _signal) {
    const result = await gitHandleAction(args.action, {
      files: args.files,
      message: args.message,
      branch: args.branch,
      staged: args.staged,
      limit: args.limit,
    }, args.cwd);

    return formatGitResult(result, args.action);
  },
};

module.exports = { gitTool };
