/**
 * @fileoverview Task tool wrapper — adapts existing task-tool.js to AgentTool interface.
 * Provides task CRUD operations for project management.
 *
 * @module tools/task-tool
 */

const {
  createDefaultTaskState,
  handleTaskAction,
  getTaskSummary,
} = require('../task-tool');

// Shared task state — singleton for the agent session
const _taskState = createDefaultTaskState();

/**
 * Format task result as text.
 */
function formatTaskResult(result, action) {
  if (!result.ok) {
    return { content: `Error: ${result.error}`, isError: true };
  }

  switch (action) {
    case 'create':
      return {
        content: `Task created: "${result.task.content}" [${result.task.id}] (priority: ${result.task.priority})`,
        details: result,
      };
    case 'list':
      if (!result.tasks || result.tasks.length === 0) {
        return { content: 'No tasks found.', details: result };
      }
      const lines = result.tasks.map((t) =>
        `  [${t.status}] ${t.content} (id: ${t.id}, priority: ${t.priority})`
      ).join('\n');
      return { content: `${result.total} task(s):\n\n${lines}`, details: result };
    case 'update':
      return {
        content: `Task updated: "${result.task.content}" [${result.task.id}]`,
        details: result,
      };
    case 'complete':
      return {
        content: `Task completed: "${result.task.content}" [${result.task.id}]`,
        details: result,
      };
    case 'delete':
      return {
        content: `Task deleted: "${result.task.content}" [${result.task.id}]`,
        details: result,
      };
    case 'summary':
      const s = result.summary;
      return {
        content: `Tasks: ${s.total} total, ${s.pending} pending, ${s.inProgress} in progress, ` +
          `${s.completed} completed, ${s.blocked} blocked (${s.percentComplete}% done)`,
        details: result,
      };
    default:
      return { content: JSON.stringify(result, null, 2), details: result };
  }
}

/**
 * AgentTool for task management.
 * @type {import('../agent/types').AgentTool}
 */
const taskTool = {
  name: 'task',
  label: 'Task Manager',
  description:
    'Manage tasks for project tracking. Supports: create, list, update, complete, delete, summary. ' +
    'Each task has content, status, priority, and optional dependencies.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'update', 'complete', 'delete', 'summary'],
        description: 'Task action to perform',
      },
      content: {
        type: 'string',
        description: 'Task description (for "create")',
      },
      id: {
        type: 'string',
        description: 'Task ID (for "update", "complete", "delete")',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Task priority (for "create"/"update")',
      },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'blocked', 'completed'],
        description: 'New status (for "update")',
      },
      dependsOn: {
        type: 'string',
        description: 'Task ID this task depends on',
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
    const result = handleTaskAction(_taskState, args.action, {
      content: args.content,
      id: args.id,
      priority: args.priority,
      status: args.status,
      dependsOn: args.dependsOn,
    });

    return formatTaskResult(result, args.action);
  },
};

module.exports = { taskTool };
