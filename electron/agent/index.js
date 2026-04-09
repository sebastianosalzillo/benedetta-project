/**
 * @fileoverview Barrel export for the Agent abstraction layer.
 *
 * Usage in main.js (when ready to adopt):
 * ```js
 * const { Agent, ToolRegistry } = require('./agent');
 * const { userMessage, toolResultMessage } = require('./agent/message-types');
 *
 * const agent = new Agent({
 *   systemPrompt: 'You are Nyx...',
 *   tools: [shellTool, fileTool, ...],
 * });
 *
 * await agent.prompt('Hello!');
 * ```
 *
 * @module agent
 */

const { Agent, PendingMessageQueue } = require('./agent');
const { runAgentLoop, parseToolCallsFromResponse, extractResponseText } = require('./agent-loop');
const { ToolRegistry, validateToolDefinition, validateToolArguments } = require('./tool-registry');
const {
  userMessage,
  assistantMessage,
  streamingAssistantMessage,
  toolResultMessage,
  systemMessage,
  customMessage,
  errorToolResult,
  isLlmVisible,
  filterLlmMessages,
  toLlmFormat,
  uid,
} = require('./message-types');
const { AgentEventType } = require('./types');

module.exports = {
  // Classes
  Agent,
  PendingMessageQueue,
  ToolRegistry,

  // Functions
  runAgentLoop,
  parseToolCallsFromResponse,
  extractResponseText,
  validateToolDefinition,
  validateToolArguments,

  // Message constructors
  userMessage,
  assistantMessage,
  streamingAssistantMessage,
  toolResultMessage,
  systemMessage,
  customMessage,
  errorToolResult,
  isLlmVisible,
  filterLlmMessages,
  toLlmFormat,
  uid,

  // Constants
  AgentEventType,
};
