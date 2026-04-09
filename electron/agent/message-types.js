/**
 * @fileoverview Message constructor factory functions.
 * Pure functions — no side effects, no external state.
 * Each function takes input and returns a properly structured message object.
 *
 * @module agent/message-types
 */

const { randomUUID } = require('crypto');

/**
 * Generate a unique message ID.
 * @returns {string}
 */
function uid() {
  return randomUUID();
}

/**
 * Create a user message from text input.
 * @param {string} text - User input text
 * @param {Object} [options]
 * @param {string} [options.requestId] - Correlating request ID
 * @param {Object} [options.meta] - Optional metadata
 * @returns {import('./types').UserMessage}
 */
function userMessage(text, options = {}) {
  return {
    role: 'user',
    id: uid(),
    text: String(text || '').trim(),
    timestamp: Date.now(),
    requestId: options.requestId || null,
    meta: options.meta || null,
  };
}

/**
 * Create an assistant message from text.
 * @param {string} text - Assistant response text
 * @param {Object} [options]
 * @param {Array<import('./types').AgentToolCall>} [options.toolCalls] - Tool calls requested
 * @param {string} [options.requestId] - Correlating request ID
 * @param {string} [options.stopReason] - Why the response stopped
 * @param {string} [options.errorMessage] - Error description if failed
 * @param {import('./types').UsageInfo} [options.usage] - Token usage
 * @returns {import('./types').AssistantMessage}
 */
function assistantMessage(text, options = {}) {
  return {
    role: 'assistant',
    id: uid(),
    text: String(text || ''),
    toolCalls: options.toolCalls || [],
    timestamp: Date.now(),
    requestId: options.requestId || null,
    stopReason: options.stopReason || null,
    errorMessage: options.errorMessage || null,
    usage: options.usage || null,
  };
}

/**
 * Create a streaming assistant message (partial, during streaming).
 * @param {string} text - Accumulated text so far
 * @param {Object} [options]
 * @param {Array<import('./types').AgentToolCall>} [options.toolCalls] - Tool calls detected so far
 * @param {string} [options.requestId] - Correlating request ID
 * @returns {import('./types').AssistantMessage}
 */
function streamingAssistantMessage(text, options = {}) {
  return {
    role: 'assistant',
    id: options.requestId ? `stream-${options.requestId}` : uid(),
    text: String(text || ''),
    toolCalls: options.toolCalls || [],
    timestamp: Date.now(),
    requestId: options.requestId || null,
    stopReason: null,
    errorMessage: null,
    usage: null,
  };
}

/**
 * Create a tool result message.
 * @param {string} toolCallId - ID of the tool call this responds to
 * @param {string} toolName - Name of the tool that executed
 * @param {string} content - Tool output text
 * @param {Object} [options]
 * @param {boolean} [options.isError] - Whether this is an error result
 * @param {string} [options.requestId] - Correlating request ID
 * @returns {import('./types').ToolResultMessage}
 */
function toolResultMessage(toolCallId, toolName, content, options = {}) {
  return {
    role: 'tool_result',
    id: uid(),
    toolCallId,
    toolName,
    content: String(content || ''),
    isError: Boolean(options.isError),
    timestamp: Date.now(),
    requestId: options.requestId || null,
  };
}

/**
 * Create a system message (instructions, persona, etc.).
 * @param {string} text - System prompt content
 * @param {Object} [options]
 * @param {string} [options.id] - Custom ID (default: auto-generated)
 * @returns {import('./types').SystemMessage}
 */
function systemMessage(text, options = {}) {
  return {
    role: 'system',
    id: options.id || uid(),
    text: String(text || ''),
    timestamp: Date.now(),
  };
}

/**
 * Create a custom UI-only notification message (not sent to LLM).
 * @param {string} text - Notification text
 * @param {string} type - Custom type identifier
 * @param {Object} [options]
 * @param {string} [options.requestId] - Correlating request ID
 * @returns {import('./types').CustomMessage}
 */
function customMessage(text, type, options = {}) {
  return {
    role: 'custom',
    id: uid(),
    text: String(text || ''),
    type: String(type || 'notification'),
    timestamp: Date.now(),
    requestId: options.requestId || null,
  };
}

/**
 * Create an error tool result (convenience wrapper).
 * @param {string} message - Error message text
 * @returns {import('./types').AgentToolResult}
 */
function errorToolResult(message) {
  return {
    content: String(message || 'Unknown error'),
    isError: true,
  };
}

/**
 * Check if a message should be sent to the LLM.
 * Filters out UI-only custom messages and system messages
 * (system prompt is handled separately).
 * @param {import('./types').AgentMessage} msg
 * @returns {boolean}
 */
function isLlmVisible(msg) {
  if (!msg || typeof msg !== 'object') return false;
  const role = msg.role;
  return role === 'user' || role === 'assistant' || role === 'tool_result';
}

/**
 * Filter messages to only include LLM-visible ones.
 * @param {import('./types').AgentMessage[]} messages
 * @returns {import('./types').AgentMessage[]}
 */
function filterLlmMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter(isLlmVisible);
}

/**
 * Convert agent messages to a format suitable for the LLM API.
 * System messages are excluded (handled as separate systemPrompt parameter).
 * Custom messages are converted to user messages with a prefix.
 * @param {import('./types').AgentMessage[]} messages
 * @returns {Array<{role: string, content: string}>}
 */
function toLlmFormat(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(isLlmVisible)
    .map((msg) => {
      if (msg.role === 'custom') {
        return { role: 'user', content: `[Notification] ${msg.text}` };
      }
      // user, assistant, tool_result pass through with standard field names
      return { role: msg.role, content: msg.text || '' };
    });
}

module.exports = {
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
};
