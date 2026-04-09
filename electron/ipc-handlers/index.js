/**
 * @fileoverview Barrel export for IPC handler factories.
 *
 * These are factory functions — they don't register handlers with ipcMain.
 * The caller (main.js) creates handlers with dependencies and registers them.
 *
 * @module ipc-handlers
 */

const { createCanvasHandlers, createBrowserHandlers } = require('./canvas');
const { createChatHandlers } = require('./chat');

module.exports = {
  createCanvasHandlers,
  createBrowserHandlers,
  createChatHandlers,
};
