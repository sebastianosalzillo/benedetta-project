/**
 * @fileoverview Agent class — stateful wrapper around the agent loop.
 * Inspired by pi-agent-core's Agent class.
 *
 * The Agent class provides:
 * - State management (transcript, tools, streaming status)
 * - Event subscription system (listeners receive all lifecycle events)
 * - Prompt queueing (steer/followUp for mid-run message injection)
 * - Abort control (cancel current run)
 * - Reset (clear all state)
 *
 * This is the PRIMARY interface that main.js will interact with.
 * Instead of calling dozens of functions directly, main.js will:
 *   1. Create an Agent instance
 *   2. Register tools via agent.tools.register()
 *   3. Subscribe to events via agent.subscribe()
 *   4. Call agent.prompt() to start a conversation
 *   5. Call agent.steer() to inject mid-run messages
 *   6. Call agent.abort() to cancel
 *
 * IMPORTANT: This module does NOT modify main.js.
 * It coexists alongside the current code and can be adopted gradually.
 *
 * @module agent/agent
 */

const { runAgentLoop } = require('./agent-loop');
const { userMessage, assistantMessage, customMessage, filterLlmMessages } = require('./message-types');
const { ToolRegistry } = require('./tool-registry');
const { AgentEventType } = require('./types');

/**
 * Queue mode for message draining.
 * @typedef {'all' | 'one-at-a-time'} QueueMode
 */

/**
 * Pending message queue — drains either all messages at once or one at a time.
 */
class PendingMessageQueue {
  /**
   * @param {QueueMode} mode
   */
  constructor(mode = 'one-at-a-time') {
    this.mode = mode;
    /** @type {import('./types').AgentMessage[]} */
    this._messages = [];
  }

  /**
   * @param {import('./types').AgentMessage} message
   */
  enqueue(message) {
    this._messages.push(message);
  }

  /** @returns {boolean} */
  hasItems() {
    return this._messages.length > 0;
  }

  /** @returns {import('./types').AgentMessage[]} */
  drain() {
    if (this.mode === 'all') {
      const drained = this._messages.slice();
      this._messages = [];
      return drained;
    }
    // one-at-a-time: return first message only
    const first = this._messages.shift();
    return first ? [first] : [];
  }

  clear() {
    this._messages = [];
  }
}

/**
 * Active run state.
 * @typedef {Object} ActiveRun
 * @property {Promise<void>} promise - Resolves when run completes
 * @property {function(): void} resolve - Resolve function for the promise
 * @property {AbortController} abortController - Abort controller for this run
 */

/**
 * Agent options.
 * @typedef {Object} AgentOptions
 * @property {string} [systemPrompt] - Initial system prompt
 * @property {import('./types').AgentTool[]} [tools] - Initial tools to register
 * @property {import('./types').AgentLoopConfig['beforeToolCall']} [beforeToolCall] - Hook before tool execution
 * @property {import('./types').AgentLoopConfig['afterToolCall']} [afterToolCall] - Hook after tool execution
 * @property {import('./types').AgentLoopConfig['transformContext']} [transformContext] - Transform context before LLM call
 * @property {import('./types').AgentLoopConfig['toolExecution']} [toolExecution] - Tool execution mode
 * @property {QueueMode} [steeringMode] - How steering messages are drained
 * @property {QueueMode} [followUpMode] - How follow-up messages are drained
 */

/**
 * Agent class — stateful wrapper around the agent loop.
 *
 * Usage:
 * ```js
 * const agent = new Agent({
 *   systemPrompt: 'You are Nyx, a helpful AI assistant.',
 *   tools: [shellTool, fileTool, webTool],
 *   beforeToolCall: async (ctx) => {
 *     if (isDangerous(ctx.toolCall.name)) return { block: true, reason: 'Dangerous tool blocked' };
 *   },
 * });
 *
 * agent.subscribe(async (event) => {
 *   if (event.type === 'message_end') {
 *     console.log('Assistant said:', event.message.text);
 *   }
 * });
 *
 * await agent.prompt('Hello!');
 * ```
 */
class Agent {
  /**
   * @param {AgentOptions} [options]
   */
  constructor(options = {}) {
    // Core state
    this._systemPrompt = options.systemPrompt || '';
    this._toolRegistry = new ToolRegistry({ tools: options.tools || [] });

    /** @type {import('./types').AgentMessage[]} */
    this._messages = [];

    // Event system
    /** @type {Set<function(import('./types').AgentEvent, AbortSignal): void|Promise<void>>} */
    this._listeners = new Set();

    // Queueing
    this._steeringQueue = new PendingMessageQueue(options.steeringMode || 'one-at-a-time');
    this._followUpQueue = new PendingMessageQueue(options.followUpMode || 'one-at-a-time');

    // Hooks
    this._beforeToolCall = options.beforeToolCall || null;
    this._afterToolCall = options.afterToolCall || null;
    this._transformContext = options.transformContext || null;
    this._toolExecution = options.toolExecution || 'parallel';

    // Active run state
    /** @type {ActiveRun|undefined} */
    this._activeRun = undefined;

    /** @type {boolean} */
    this._isStreaming = false;

    /** @type {import('./types').AssistantMessage|null} */
    this._streamingMessage = null;

    /** @type {Set<string>} */
    this._pendingToolCalls = new Set();

    /** @type {string|null} */
    this._errorMessage = null;
  }

  // ============================================================
  // State Accessors
  // ============================================================

  /**
   * Get the current system prompt.
   * @returns {string}
   */
  get systemPrompt() {
    return this._systemPrompt;
  }

  /**
   * Set the system prompt.
   * @param {string} value
   */
  set systemPrompt(value) {
    this._systemPrompt = String(value || '');
  }

  /**
   * Get the tool registry (for adding/removing tools).
   * @returns {ToolRegistry}
   */
  get tools() {
    return this._toolRegistry;
  }

  /**
   * Get a read-only copy of the message transcript.
   * @returns {import('./types').AgentMessage[]}
   */
  get messages() {
    return [...this._messages];
  }

  /**
   * Get a read-only copy of LLM-visible messages.
   * @returns {import('./types').AgentMessage[]}
   */
  get llmMessages() {
    return filterLlmMessages(this._messages);
  }

  /**
   * Whether the agent is currently processing a response.
   * @returns {boolean}
   */
  get isStreaming() {
    return this._isStreaming;
  }

  /**
   * The partial assistant message during streaming, if any.
   * @returns {import('./types').AssistantMessage|null}
   */
  get streamingMessage() {
    return this._streamingMessage;
  }

  /**
   * Tool call IDs currently executing.
   * @returns {ReadonlySet<string>}
   */
  get pendingToolCalls() {
    return new Set(this._pendingToolCalls);
  }

  /**
   * Error from the most recent failed turn, if any.
   * @returns {string|null}
   */
  get errorMessage() {
    return this._errorMessage;
  }

  /**
   * Active abort signal for the current run.
   * @returns {AbortSignal|undefined}
   */
  get signal() {
    return this._activeRun?.abortController.signal;
  }

  /**
   * Controls how queued steering messages are drained.
   * @type {QueueMode}
   */
  get steeringMode() {
    return this._steeringQueue.mode;
  }

  set steeringMode(mode) {
    this._steeringQueue.mode = mode;
  }

  /**
   * Controls how queued follow-up messages are drained.
   * @type {QueueMode}
   */
  get followUpMode() {
    return this._followUpQueue.mode;
  }

  set followUpMode(mode) {
    this._followUpQueue.mode = mode;
  }

  // ============================================================
  // Event System
  // ============================================================

  /**
   * Subscribe to agent lifecycle events.
   * Listener promises are awaited in subscription order.
   *
   * @param {function(import('./types').AgentEvent, AbortSignal): void|Promise<void>} listener
   * @returns {function(): void} Unsubscribe function
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Emit an event to all subscribers.
   * @param {import('./types').AgentEvent} event
   * @param {AbortSignal} signal
   * @returns {Promise<void>}
   */
  async _emit(event, signal) {
    for (const listener of this._listeners) {
      try {
        await listener(event, signal);
      } catch (err) {
        console.error('[agent] Event listener error:', err.message);
      }
    }
  }

  // ============================================================
  // Message Queueing
  // ============================================================

  /**
   * Queue a message to be injected after the current assistant turn finishes.
   * Steering messages interrupt the current flow and are processed immediately.
   * @param {import('./types').AgentMessage} message
   */
  steer(message) {
    this._steeringQueue.enqueue(message);
  }

  /**
   * Queue a message to run only after the agent would otherwise stop.
   * Follow-up messages wait for the agent to finish, then continue.
   * @param {import('./types').AgentMessage} message
   */
  followUp(message) {
    this._followUpQueue.enqueue(message);
  }

  /** Remove all queued steering messages. */
  clearSteeringQueue() {
    this._steeringQueue.clear();
  }

  /** Remove all queued follow-up messages. */
  clearFollowUpQueue() {
    this._followUpQueue.clear();
  }

  /** Remove all queued steering and follow-up messages. */
  clearAllQueues() {
    this.clearSteeringQueue();
    this.clearFollowUpQueue();
  }

  /** @returns {boolean} True when either queue still contains pending messages. */
  hasQueuedMessages() {
    return this._steeringQueue.hasItems() || this._followUpQueue.hasItems();
  }

  // ============================================================
  // Run Lifecycle
  // ============================================================

  /**
   * Abort the current run, if one is active.
   */
  abort() {
    if (this._activeRun) {
      this._activeRun.abortController.abort();
    }
  }

  /**
   * Resolve when the current run and all awaited event listeners have finished.
   * @returns {Promise<void>}
   */
  waitForIdle() {
    return this._activeRun?.promise ?? Promise.resolve();
  }

  /**
   * Clear transcript state, runtime state, and queued messages.
   */
  reset() {
    this._messages = [];
    this._isStreaming = false;
    this._streamingMessage = null;
    this._pendingToolCalls.clear();
    this._errorMessage = null;
    this.clearFollowUpQueue();
    this.clearSteeringQueue();
    if (this._activeRun) {
      this.abort();
      this._activeRun = undefined;
    }
  }

  /**
   * Process an internal event — update state and notify listeners.
   * @param {import('./types').AgentEvent} event
   * @param {AbortSignal} signal
   * @returns {Promise<void>}
   */
  async _processEvent(event, signal) {
    switch (event.type) {
      case AgentEventType.MESSAGE_START:
        this._streamingMessage = event.message || null;
        break;

      case AgentEventType.MESSAGE_UPDATE:
        this._streamingMessage = event.message || null;
        break;

      case AgentEventType.MESSAGE_END:
        this._streamingMessage = null;
        if (event.message) {
          this._messages.push(event.message);
        }
        break;

      case AgentEventType.TOOL_EXEC_START:
        if (event.toolCallId) {
          this._pendingToolCalls.add(event.toolCallId);
        }
        break;

      case AgentEventType.TOOL_EXEC_END:
        if (event.toolCallId) {
          this._pendingToolCalls.delete(event.toolCallId);
        }
        break;

      case AgentEventType.TURN_END:
        if (event.message?.errorMessage) {
          this._errorMessage = event.message.errorMessage;
        }
        break;

      case AgentEventType.AGENT_END:
        this._streamingMessage = null;
        break;
    }

    // Notify external listeners
    await this._emit(event, signal);
  }

  /**
   * Handle a run failure — create error message and notify.
   * @param {Error|string} error
   * @param {boolean} aborted
   * @param {AbortSignal} signal
   * @returns {Promise<void>}
   */
  async _handleRunFailure(error, aborted, signal) {
    const errorMsg = typeof error === 'string' ? error : error.message;
    const failureMessage = assistantMessage(`Error: ${errorMsg}`, {
      stopReason: aborted ? 'aborted' : 'error',
      errorMessage: errorMsg,
    });

    this._messages.push(failureMessage);
    this._errorMessage = errorMsg;

    await this._processEvent({ type: AgentEventType.MESSAGE_START, message: failureMessage }, signal);
    await this._processEvent({ type: AgentEventType.MESSAGE_END, message: failureMessage }, signal);
    await this._processEvent({ type: AgentEventType.AGENT_END, messages: [failureMessage] }, signal);
  }

  /**
   * Finish the current run — clear streaming state.
   */
  _finishRun() {
    this._isStreaming = false;
    this._streamingMessage = null;
    this._pendingToolCalls.clear();
    if (this._activeRun) {
      this._activeRun.resolve();
      this._activeRun = undefined;
    }
  }

  /**
   * Run an executor function with full lifecycle management.
   * @param {function(AgentContext, AgentLoopConfig, function, AbortSignal): Promise<import('./types').AgentMessage[]>} executor
   * @returns {Promise<import('./types').AgentMessage[]>}
   */
  async _runWithLifecycle(executor) {
    if (this._activeRun) {
      throw new Error(
        'Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.'
      );
    }

    const abortController = new AbortController();
    let resolvePromise = () => {};
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    this._activeRun = { promise, resolve: resolvePromise, abortController };

    this._isStreaming = true;
    this._streamingMessage = null;
    this._errorMessage = null;

    // Emit agent_start
    await this._processEvent({ type: AgentEventType.AGENT_START }, abortController.signal);

    try {
      // Build context and config
      const context = {
        systemPrompt: this._systemPrompt,
        messages: [...this._messages],
        tools: this._toolRegistry.getAll(),
      };

      const config = {
        beforeToolCall: this._beforeToolCall,
        afterToolCall: this._afterToolCall,
        transformContext: this._transformContext,
        toolExecution: this._toolExecution,
        getSteeringMessages: async () => this._steeringQueue.drain(),
        getFollowUpMessages: async () => this._followUpQueue.drain(),
        onEvent: async (event) => {
          await this._processEvent(event, abortController.signal);
        },
      };

      return await executor(context, config, abortController.signal);
    } catch (error) {
      await this._handleRunFailure(error, abortController.signal.aborted, abortController.signal);
      return [];
    } finally {
      this._finishRun();
    }
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Start a new prompt.
   * Accepts text, a message object, or an array of messages.
   *
   * @param {string|import('./types').AgentMessage|import('./types').AgentMessage[]} input
   * @param {Object} [options]
   * @param {function(string, import('./types').AgentMessage[], import('./types').AgentTool[]): Promise<{ok: boolean, text?: string, error?: string}>} [options.streamFn] - LLM streaming function
   * @returns {Promise<import('./types').AgentMessage[]>} New messages produced
   */
  async prompt(input, options = {}) {
    const messages = this._normalizeInput(input);

    return this._runWithLifecycle(async (context, config, signal) => {
      // Add user messages to transcript
      for (const msg of messages) {
        this._messages.push(msg);
        await this._processEvent({ type: AgentEventType.MESSAGE_START, message: msg }, signal);
        await this._processEvent({ type: AgentEventType.MESSAGE_END, message: msg }, signal);
      }

      // Run the agent loop
      const streamFn = options.streamFn || this._defaultStreamFn;
      const updatedContext = {
        ...context,
        messages: [...this._messages],
      };

      const newMessages = await runAgentLoop(updatedContext, config, streamFn, config.onEvent, signal);
      return newMessages;
    });
  }

  /**
   * Continue from the current transcript without adding a new user message.
   * Useful after tool results have been added externally.
   *
   * @param {Object} [options]
   * @param {function(string, import('./types').AgentMessage[], import('./types').AgentTool[]): Promise<{ok: boolean, text?: string, error?: string}>} [options.streamFn]
   * @returns {Promise<import('./types').AgentMessage[]>}
   */
  async continue(options = {}) {
    if (this._activeRun) {
      throw new Error('Agent is already processing. Wait for completion before continuing.');
    }

    const lastMessage = this._messages[this._messages.length - 1];
    if (!lastMessage) {
      throw new Error('No messages to continue from');
    }
    if (lastMessage.role === 'assistant') {
      throw new Error('Cannot continue from assistant message');
    }

    return this._runWithLifecycle(async (context, config, signal) => {
      const streamFn = options.streamFn || this._defaultStreamFn;
      return await runAgentLoop(context, config, streamFn, config.onEvent, signal);
    });
  }

  /**
   * Inject a custom message into the transcript without triggering the LLM.
   * Useful for adding system notifications, tool results, or state changes.
   *
   * @param {import('./types').AgentMessage} message
   */
  injectMessage(message) {
    this._messages.push(message);
  }

  /**
   * Get the full agent state as a plain object (for serialization/debugging).
   * @returns {Object}
   */
  getState() {
    return {
      systemPrompt: this._systemPrompt,
      messages: this._messages,
      tools: this._toolRegistry.getAllMetadata(),
      isStreaming: this._isStreaming,
      streamingMessage: this._streamingMessage,
      pendingToolCalls: Array.from(this._pendingToolCalls),
      errorMessage: this._errorMessage,
      steeringQueueSize: this._steeringQueue.hasItems() ? 'has items' : 'empty',
      followUpQueueSize: this._followUpQueue.hasItems() ? 'has items' : 'empty',
    };
  }

  // ============================================================
  // Internal Helpers
  // ============================================================

  /**
   * Normalize prompt input to an array of user messages.
   * @param {string|import('./types').AgentMessage|import('./types').AgentMessage[]} input
   * @returns {import('./types').UserMessage[]}
   * @private
   */
  _normalizeInput(input) {
    if (Array.isArray(input)) {
      return input;
    }
    if (typeof input === 'string') {
      return [userMessage(input)];
    }
    if (input && typeof input === 'object' && input.role) {
      return [input];
    }
    // Fallback: treat as text
    return [userMessage(String(input))];
  }

  /**
   * Default stream function placeholder — must be overridden via prompt() options
   * or by setting agent._defaultStreamFn before calling prompt().
   *
   * @param {string} _systemPrompt
   * @param {import('./types').AgentMessage[]} _messages
   * @param {import('./types').AgentTool[]} _tools
   * @returns {Promise<{ok: boolean, text?: string, error?: string}>}
   * @private
   */
  async _defaultStreamFn(_systemPrompt, _messages, _tools) {
    return {
      ok: false,
      error: 'No streamFn provided. Pass a streamFn via agent.prompt(text, { streamFn }) or set agent._defaultStreamFn.',
    };
  }
}

module.exports = {
  Agent,
  PendingMessageQueue,
};
