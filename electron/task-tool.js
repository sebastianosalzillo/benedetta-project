/**
 * @fileoverview Task management tool.
 * Provides task CRUD operations with priority, dependencies, and status tracking.
 */

const MAX_TASKS = 50;

/**
 * Task item.
 * @typedef {Object} Task
 * @property {string} id - Unique task identifier
 * @property {string} content - Task description
 * @property {string} status - Task status (pending, in_progress, completed, blocked)
 * @property {string} priority - Task priority (low, medium, high)
 * @property {string|null} dependsOn - ID of dependency task
 * @property {string} createdAt - ISO date string
 * @property {string} updatedAt - ISO date string
 * @property {string|null} completedAt - ISO date string when completed
 * @property {string} notes - Additional task notes
 */

/**
 * Task state.
 * @typedef {Object} TaskState
 * @property {Task[]} tasks - Array of tasks
 * @property {number} nextId - Next task counter
 */

/**
 * Task summary.
 * @typedef {Object} TaskSummary
 * @property {number} total - Total number of tasks
 * @property {number} pending - Number of pending tasks
 * @property {number} inProgress - Number of in-progress tasks
 * @property {number} completed - Number of completed tasks
 * @property {number} blocked - Number of blocked tasks
 * @property {number} percentComplete - Completion percentage (0-100)
 */

/**
 * Create an empty task state.
 *
 * @returns {TaskState} Empty task state object
 * @example
 * const state = createDefaultTaskState()
 */
function createDefaultTaskState() {
  return {
    tasks: [],
    nextId: 1,
  };
}

/**
 * Task creation options.
 * @typedef {Object} TaskCreateOptions
 * @property {string} [dependsOn=null] - ID of dependency task
 * @property {string} [priority='medium'] - Task priority (low, medium, high)
 */

/**
 * Create a task item.
 *
 * @param {string} content - Task description
 * @param {TaskCreateOptions} [options] - Task creation options
 * @returns {Task} Created task object
 * @example
 * createTask('Review PR #42', { priority: 'high' })
 */
function createTask(content, options = {}) {
  const { dependsOn = null, priority = 'medium' } = options;
  const task = {
    id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    content: String(content || '').trim(),
    status: 'pending',
    priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
    dependsOn: dependsOn || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    notes: '',
  };
  return task;
}

/**
 * Add a task to the task state.
 *
 * @param {TaskState} taskState - Task state object
 * @param {string} content - Task description
 * @param {TaskCreateOptions} [options] - Task creation options
 * @returns {{ok: boolean, task?: Task, error?: string}} Add result
 * @example
 * addTask(state, 'Write unit tests', { priority: 'high' })
 */
function addTask(taskState, content, options = {}) {
  if (taskState.tasks.length >= MAX_TASKS) {
    return { ok: false, error: `Max ${MAX_TASKS} tasks reached.` };
  }
  const task = createTask(content, options);
  taskState.tasks.push(task);
  return { ok: true, task };
}

/**
 * List tasks with optional filters.
 *
 * @param {TaskState} taskState - Task state object
 * @param {Object} [options] - Filter options
 * @param {string} [options.status=null] - Filter by status
 * @param {string} [options.priority=null] - Filter by priority
 * @returns {{ok: boolean, tasks?: Task[], total?: number, error?: string}} List result
 * @example
 * listTasks(state, { status: 'pending', priority: 'high' })
 */
function listTasks(taskState, options = {}) {
  const { status = null, priority = null } = options;
  let filtered = taskState.tasks;
  if (status) filtered = filtered.filter((t) => t.status === status);
  if (priority) filtered = filtered.filter((t) => t.priority === priority);
  return { ok: true, tasks: filtered, total: filtered.length };
}

/**
 * Update a task's properties.
 *
 * @param {TaskState} taskState - Task state object
 * @param {string} taskId - Task ID to update
 * @param {Object} [updates] - Properties to update (content, status, priority, notes, dependsOn)
 * @returns {{ok: boolean, task?: Task, error?: string}} Update result
 * @example
 * updateTask(state, 'task-123', { status: 'in_progress' })
 */
function updateTask(taskState, taskId, updates = {}) {
  const task = taskState.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, error: 'Task not found.' };

  if (updates.content !== undefined) task.content = String(updates.content).trim();
  if (updates.status !== undefined) task.status = updates.status;
  if (updates.priority !== undefined) task.priority = updates.priority;
  if (updates.notes !== undefined) task.notes = String(updates.notes);
  if (updates.dependsOn !== undefined) task.dependsOn = updates.dependsOn;

  task.updatedAt = new Date().toISOString();
  return { ok: true, task };
}

/**
 * Mark a task as completed.
 *
 * @param {TaskState} taskState - Task state object
 * @param {string} taskId - Task ID to complete
 * @returns {{ok: boolean, task?: Task, error?: string}} Complete result
 */
function completeTask(taskState, taskId) {
  const task = taskState.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, error: 'Task not found.' };

  task.status = 'completed';
  task.completedAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();
  return { ok: true, task };
}

/**
 * Delete a task.
 *
 * @param {TaskState} taskState - Task state object
 * @param {string} taskId - Task ID to delete
 * @returns {{ok: boolean, task?: Task, error?: string}} Delete result
 */
function deleteTask(taskState, taskId) {
  const index = taskState.tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return { ok: false, error: 'Task not found.' };

  const removed = taskState.tasks.splice(index, 1)[0];
  return { ok: true, task: removed };
}

/**
 * Get a summary of task counts by status.
 *
 * @param {TaskState} taskState - Task state object
 * @returns {{ok: true, summary: TaskSummary}} Summary result
 */
function getTaskSummary(taskState) {
  const total = taskState.tasks.length;
  const pending = taskState.tasks.filter((t) => t.status === 'pending').length;
  const inProgress = taskState.tasks.filter((t) => t.status === 'in_progress').length;
  const completed = taskState.tasks.filter((t) => t.status === 'completed').length;
  const blocked = taskState.tasks.filter((t) => t.status === 'blocked').length;

  return {
    total,
    pending,
    inProgress,
    completed,
    blocked,
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Task action parameters.
 * @typedef {Object} TaskActionParams
 * @property {string} [content] - Task content (for create)
 * @property {string} [id] - Task ID (for update/complete/delete)
 * @property {string} [status] - Task status (for update)
 * @property {string} [priority] - Task priority (for create/update)
 * @property {string} [notes] - Task notes (for update)
 * @property {string} [dependsOn] - Dependency task ID (for create/update)
 */

/**
 * Execute a task action by name.
 *
 * @param {TaskState} taskState - Task state object
 * @param {string} action - Action name (create, list, update, complete, delete, summary)
 * @param {TaskActionParams} [params] - Action-specific parameters
 * @returns {{ok: boolean, task?: Task, tasks?: Task[], summary?: TaskSummary, error?: string}} Action result
 * @example
 * handleTaskAction(state, 'create', { content: 'Review PR #42', priority: 'high' })
 * handleTaskAction(state, 'list', { status: 'pending' })
 * handleTaskAction(state, 'summary')
 */
function handleTaskAction(taskState, action, params = {}) {
  switch (action) {
    case 'create':
      return addTask(taskState, params.content, params);
    case 'list':
      return listTasks(taskState, params);
    case 'update':
      return updateTask(taskState, params.id, params);
    case 'complete':
      return completeTask(taskState, params.id);
    case 'delete':
      return deleteTask(taskState, params.id);
    case 'summary':
      return { ok: true, summary: getTaskSummary(taskState) };
    default:
      return { ok: false, error: `Unknown task action: ${action}` };
  }
}

module.exports = {
  createDefaultTaskState,
  createTask,
  addTask,
  listTasks,
  updateTask,
  completeTask,
  deleteTask,
  getTaskSummary,
  handleTaskAction,
  MAX_TASKS,
};
