/**
 * @fileoverview Shell tool wrapper — adapts existing shell-tool.js to AgentTool interface.
 *
 * This module WRAPS the existing electron/shell-tool.js functions.
 * It does NOT replace or modify them — it only adds the AgentTool adapter layer.
 *
 * @module tools/shell-tool
 */

const {
  runShellCommand,
  stopShellProcess,
  listShellProcesses,
  isDangerous,
} = require('../shell-tool');

/**
 * AgentTool wrapper for shell command execution.
 * @type {import('../agent/types').AgentTool}
 */
const shellTool = {
  name: 'shell',
  label: 'Shell Command',
  description:
    'Execute a shell command in a sandboxed subprocess. ' +
    'Supports safe commands only — dangerous commands (rm -rf, format, shutdown, etc.) are blocked. ' +
    'Returns stdout, stderr, exit code. Max 5 concurrent processes, 30s timeout default.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (optional)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
      },
    },
    required: ['command'],
    additionalProperties: false,
  },

  /**
   * @param {string} _toolCallId
   * @param {{command: string, cwd?: string, timeout?: number}} args
   * @param {AbortSignal} [_signal]
   * @param {function} [_onUpdate]
   * @returns {Promise<import('../agent/types').AgentToolResult>}
   */
  async execute(_toolCallId, args, _signal, _onUpdate) {
    const result = await runShellCommand(args.command, {
      cwd: args.cwd,
      timeout: args.timeout,
    });

    if (!result.ok) {
      return {
        content: `Error: ${result.error}${result.stdout ? '\nOutput:\n' + result.stdout : ''}`,
        details: result,
        isError: true,
      };
    }

    const content = [
      result.stdout ? `stdout:\n${result.stdout}` : '',
      result.stderr ? `stderr:\n${result.stderr}` : '',
      result.exitCode !== undefined && result.exitCode !== 0 ? `Exit code: ${result.exitCode}` : '',
    ]
      .filter(Boolean)
      .join('\n\n') || 'Command executed successfully (no output)';

    return {
      content,
      details: result,
    };
  },
};

module.exports = { shellTool, isDangerous };
