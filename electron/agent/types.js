/**
 * @fileoverview Central type definitions for the Agent abstraction layer.
 * Inspired by pi-agent-core types, adapted for CommonJS / JSDoc.
 *
 * This module is PURE TYPE DEFINITIONS — no runtime logic, no side effects.
 * It exists solely to provide JSDoc types for IDE autocomplete and documentation.
 *
 * @module agent/types
 */

// ============================================================
// Message Types
// ============================================================

/**
 * Base message shared by all agent message types.
 * @typedef {Object} BaseMessage
 * @property {string} id - Unique message identifier
 * @property {number} timestamp - Unix timestamp in milliseconds
 * @property {string} [requestId] - Optional request ID for correlation
 */

/**
 * User message — text from the user (may include images in future).
 * @typedef {Object} UserMessage
 * @property {'user'} role
 * @property {string} text - User input text
 * @property {string} id
 * @property {number} timestamp
 * @property {string} [requestId]
 * @property {Object} [meta] - Optional metadata (e.g., { bootstrap: true })
 */

/**
 * Assistant message — text response from the AI.
 * @typedef {Object} AssistantMessage
 * @property {'assistant'} role
 * @property {string} text - Assistant response text
 * @property {Array<AgentToolCall>} [toolCalls] - Tool calls requested by the assistant
 * @property {string} id
 * @property {number} timestamp
 * @property {string} [requestId]
 * @property {'stop'|'tool_use'|'error'|'aborted'|'length'} [stopReason]
 * @property {string} [errorMessage]
 * @property {UsageInfo} [usage] - Token usage information
 */

/**
 * Tool result message — output from a tool execution.
 * @typedef {Object} ToolResultMessage
 * @property {'tool_result'} role
 * @property {string} toolCallId - ID of the tool call this responds to
 * @property {string} toolName - Name of the tool that was executed
 * @property {string} content - Tool output text
 * @property {boolean} isError - Whether the tool execution failed
 * @property {string} id
 * @property {number} timestamp
 */

/**
 * System message — injected context (persona, instructions, etc.).
 * @typedef {Object} SystemMessage
 * @property {'system'} role
 * @property {string} text - System prompt content
 * @property {string} id
 * @property {number} timestamp
 */

/**
 * Custom message for UI-only notifications (not sent to LLM).
 * @typedef {Object} CustomMessage
 * @property {'custom'} role
 * @property {string} text - Notification text
 * @property {string} type - Custom type identifier
 * @property {string} id
 * @property {number} timestamp
 */

/**
 * Union of all agent message types.
 * @typedef {UserMessage | AssistantMessage | ToolResultMessage | SystemMessage | CustomMessage} AgentMessage
 */

// ============================================================
// Tool Types
// ============================================================

/**
 * A single tool call content block (what the LLM emits to request a tool).
 * @typedef {Object} AgentToolCall
 * @property {string} id - Unique tool call identifier
 * @property {string} name - Tool name
 * @property {Object} arguments - Validated arguments for the tool
 * @property {string} [thought] - Optional reasoning from the model
 */

/**
 * Result returned from a tool execution.
 * @typedef {Object} AgentToolResult
 * @property {string} content - Text content returned to the model
 * @property {*} [details] - Arbitrary structured data for logs/UI
 * @property {boolean} [isError] - Whether this is an error result
 */

/**
 * Context passed to beforeToolCall hook.
 * @typedef {Object} BeforeToolCallContext
 * @property {AssistantMessage} assistantMessage - The message that requested the tool
 * @property {AgentToolCall} toolCall - The raw tool call block
 * @property {Object} args - Validated arguments
 * @property {AgentContext} context - Current agent context snapshot
 */

/**
 * Result returned from beforeToolCall hook.
 * @typedef {Object} BeforeToolCallResult
 * @property {boolean} [block] - If true, prevent tool execution
 * @property {string} [reason] - Reason shown in error result if blocked
 */

/**
 * Context passed to afterToolCall hook.
 * @typedef {Object} AfterToolCallContext
 * @property {AssistantMessage} assistantMessage - The message that requested the tool
 * @property {AgentToolCall} toolCall - The raw tool call block
 * @property {Object} args - Validated arguments
 * @property {AgentToolResult} result - The executed tool result
 * @property {boolean} isError - Current error flag
 * @property {AgentContext} context - Current agent context snapshot
 */

/**
 * Partial override returned from afterToolCall hook.
 * @typedef {Object} AfterToolCallResult
 * @property {string} [content] - If provided, replaces the result content
 * @property {*} [details] - If provided, replaces the result details
 * @property {boolean} [isError] - If provided, replaces the error flag
 */

/**
 * Tool definition interface — uniform API for all tools.
 * @typedef {Object} AgentTool
 * @property {string} name - Unique tool name (lowercase, no spaces)
 * @property {string} label - Human-readable display name
 * @property {string} description - What the tool does (shown to LLM)
 * @property {Object} parameters - JSON Schema for tool arguments
 * @property {function(string, Object, AbortSignal=): Promise<AgentToolResult>} execute - Execute the tool
 * @property {function(Object): Object} [prepareArguments] - Optional args shim before validation
 */

// ============================================================
// Agent Context & State
// ============================================================

/**
 * Token usage information.
 * @typedef {Object} UsageInfo
 * @property {number} input - Input tokens
 * @property {number} output - Output tokens
 * @property {number} [cacheRead] - Cached input tokens
 * @property {number} [cacheWrite] - Cached write tokens
 * @property {number} [totalTokens] - Total tokens
 */

/**
 * Context snapshot passed into the agent loop.
 * @typedef {Object} AgentContext
 * @property {string} systemPrompt - System prompt for the LLM
 * @property {AgentMessage[]} messages - Transcript visible to the model
 * @property {AgentTool[]} [tools] - Available tools for this run
 */

/**
 * Tool execution strategy.
 * @typedef {'sequential' | 'parallel'} ToolExecutionMode
 */

/**
 * Configuration for the agent loop.
 * @typedef {Object} AgentLoopConfig
 * @property {AgentTool[]} tools - Available tools
 * @property {function(BeforeToolCallContext, AbortSignal=): Promise<BeforeToolCallResult|undefined>} [beforeToolCall] - Hook before tool execution
 * @property {function(AfterToolCallContext, AbortSignal=): Promise<AfterToolCallResult|undefined>} [afterToolCall] - Hook after tool execution
 * @property {ToolExecutionMode} [toolExecution] - Sequential or parallel tool execution (default: 'parallel')
 * @property {function(AgentMessage[], AbortSignal=): Promise<AgentMessage[]>} [transformContext] - Transform context before LLM call
 * @property {function(): Promise<AgentMessage[]>} [getSteeringMessages] - Get mid-run steering messages
 * @property {function(): Promise<AgentMessage[]>} [getFollowUpMessages] - Get follow-up messages after agent would stop
 * @property {function(AgentEvent): Promise<void>|void} [onEvent] - Event listener
 * @property {function(string, Object): Promise<{ok: boolean, text?: string, error?: string}>} [streamFn] - LLM streaming function (model, context) => stream
 */

/**
 * Public agent state (read-only view).
 * @typedef {Object} AgentState
 * @property {string} systemPrompt - System prompt
 * @property {AgentMessage[]} messages - Transcript (read-only copy)
 * @property {AgentTool[]} tools - Available tools (read-only copy)
 * @property {boolean} isStreaming - True while processing a response
 * @property {AssistantMessage|null} streamingMessage - Partial assistant message during streaming
 * @property {Set<string>} pendingToolCalls - Tool call IDs currently executing
 * @property {string|null} errorMessage - Error from most recent failed turn
 */

// ============================================================
// Event Types
// ============================================================

/**
 * Events emitted by the Agent during lifecycle.
 * @typedef {Object} AgentEvent
 * @property {string} type - Event type discriminator
 * @property {AgentMessage} [message] - Associated message
 * @property {string} [toolCallId] - Associated tool call ID
 * @property {string} [toolName] - Tool name
 * @property {*} [args] - Tool arguments
 * @property {AgentToolResult} [result] - Tool result
 * @property {boolean} [isError] - Error flag
 * @property {AgentMessage[]} [messages] - Batch of messages (for agent_end)
 */

/**
 * Event type strings.
 * @enum {string}
 */
const AgentEventType = Object.freeze({
  AGENT_START: 'agent_start',
  AGENT_END: 'agent_end',
  TURN_START: 'turn_start',
  TURN_END: 'turn_end',
  MESSAGE_START: 'message_start',
  MESSAGE_UPDATE: 'message_update',
  MESSAGE_END: 'message_end',
  TOOL_EXEC_START: 'tool_execution_start',
  TOOL_EXEC_UPDATE: 'tool_execution_update',
  TOOL_EXEC_END: 'tool_execution_end',
  STREAM_START: 'stream_start',
  STREAM_DELTA: 'stream_delta',
  STREAM_END: 'stream_end',
});

// ============================================================
// Stream Types (for LLM responses)
// ============================================================

/**
 * Streaming text delta from LLM.
 * @typedef {Object} StreamDelta
 * @property {'text'|'tool_call'|'done'} type
 * @property {string} [text] - Text chunk (for 'text' type)
 * @property {AgentToolCall} [toolCall] - Tool call (for 'tool_call' type)
 * @property {string} [stopReason] - Stop reason (for 'done' type)
 */

/**
 * LLM stream response iterator-like interface.
 * @typedef {Object} LLMStream
 * @property {function(): AsyncIterator<StreamDelta>} [Symbol.asyncIterator]
 * @property {function(): Promise<AssistantMessage>} result - Final message when stream completes
 */

/**
 * Function signature for LLM streaming.
 * Takes system prompt + messages + tools, returns an async stream.
 * @typedef {function(string, AgentMessage[], AgentTool[]): Promise<LLMStream>} LLMStreamFn
 */

// ============================================================
// Queue Types
// ============================================================

/**
 * How queued messages are drained.
 * @typedef {'all' | 'one-at-a-time'} QueueMode
 */

// ============================================================
// Module exports (type-only, no runtime values except AgentEventType)
// ============================================================

module.exports = {
  AgentEventType,
};
