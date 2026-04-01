const path = require('path');

const MAX_TASKS = 50;

function createDefaultTaskState() {
  return {
    tasks: [],
    nextId: 1,
  };
}

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

function addTask(taskState, content, options = {}) {
  if (taskState.tasks.length >= MAX_TASKS) {
    return { ok: false, error: `Max ${MAX_TASKS} task raggiunti.` };
  }
  const task = createTask(content, options);
  taskState.tasks.push(task);
  return { ok: true, task };
}

function listTasks(taskState, options = {}) {
  const { status = null, priority = null } = options;
  let filtered = taskState.tasks;
  if (status) filtered = filtered.filter((t) => t.status === status);
  if (priority) filtered = filtered.filter((t) => t.priority === priority);
  return { ok: true, tasks: filtered, total: filtered.length };
}

function updateTask(taskState, taskId, updates = {}) {
  const task = taskState.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, error: 'Task non trovato.' };

  if (updates.content !== undefined) task.content = String(updates.content).trim();
  if (updates.status !== undefined) task.status = updates.status;
  if (updates.priority !== undefined) task.priority = updates.priority;
  if (updates.notes !== undefined) task.notes = String(updates.notes);
  if (updates.dependsOn !== undefined) task.dependsOn = updates.dependsOn;

  task.updatedAt = new Date().toISOString();
  return { ok: true, task };
}

function completeTask(taskState, taskId) {
  const task = taskState.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, error: 'Task non trovato.' };

  task.status = 'completed';
  task.completedAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();
  return { ok: true, task };
}

function deleteTask(taskState, taskId) {
  const index = taskState.tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return { ok: false, error: 'Task non trovato.' };

  const removed = taskState.tasks.splice(index, 1)[0];
  return { ok: true, task: removed };
}

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
      return { ok: false, error: `Azione task sconosciuta: ${action}` };
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
