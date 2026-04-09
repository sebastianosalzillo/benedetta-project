/**
 * @fileoverview Barrel export for all AgentTool wrappers.
 *
 * Usage:
 * ```js
 * const { allTools } = require('./tools');
 * const { Agent } = require('./agent');
 *
 * const agent = new Agent({
 *   systemPrompt: 'You are Nyx...',
 *   tools: allTools,
 * });
 * ```
 *
 * @module tools
 */

const { shellTool } = require('./shell-tool');
const {
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listDirTool,
} = require('./file-tool');
const {
  globSearchTool,
  grepSearchTool,
  readManyFilesTool,
} = require('./search-tool');
const {
  webFetchTool,
  webSearchTool,
} = require('./web-tool');
const { gitTool } = require('./git-tool');
const { taskTool } = require('./task-tool');
const { skillsTool } = require('./skills-tool');

/**
 * Array of all registered AgentTools.
 * @type {import('../agent/types').AgentTool[]}
 */
const allTools = [
  shellTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listDirTool,
  globSearchTool,
  grepSearchTool,
  readManyFilesTool,
  webFetchTool,
  webSearchTool,
  gitTool,
  taskTool,
  skillsTool,
];

/**
 * Map of tool name -> tool for fast lookup.
 * @type {Object<string, import('../agent/types').AgentTool>}
 */
const toolsByName = {};
for (const tool of allTools) {
  toolsByName[tool.name] = tool;
}

module.exports = {
  allTools,
  toolsByName,
  // Individual tools for selective import
  shellTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listDirTool,
  globSearchTool,
  grepSearchTool,
  readManyFilesTool,
  webFetchTool,
  webSearchTool,
  gitTool,
  taskTool,
  skillsTool,
};
