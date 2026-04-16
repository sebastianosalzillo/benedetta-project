/**
 * @fileoverview Core agent loop — the main reasoning cycle.
 * Inspired by pi-agent-core's agent-loop.ts.
 *
 * The loop works like this:
 * 1. Send context (systemPrompt + messages + tools) to the LLM via streamFn
 * 2. Stream assistant response, emitting events for each delta
 * 3. When response is complete, check for tool calls
 * 4. If tool calls exist, execute them (sequential or parallel)
 * 5. Append tool results to the transcript
 * 6. Repeat from step 1 until no more tool calls
 *
 * This module is a PURE FUNCTION — it takes inputs and emits events via callback.
 * It has NO global state, NO side effects outside the emit function.
 *
 * IMPORTANT: This module does NOT create the Agent class.
 * It only provides the `runAgentLoop` function that Agent will call.
 *
 * @module agent/agent-loop
 */

const {
  userMessage,
  assistantMessage,
  toolResultMessage,
  errorToolResult,
  filterLlmMessages,
} = require('./message-types');

const { AgentEventType } = require('./types');

/**
 * Emit a single agent event via callback.
 * @param {function(import('./types').AgentEvent): Promise<void>|void} emit
 * @param {import('./types').AgentEvent} event
 * @returns {Promise<void>}
 */
async function emitEvent(emit, event) {
  if (typeof emit === 'function') {
    await emit(event);
  }
}

/**
 * Emit multiple agent events in sequence.
 * @param {function(import('./types').AgentEvent): Promise<void>|void} emit
 * @param {import('./types').AgentEvent[]} events
 * @returns {Promise<void>}
 */
async function emitEvents(emit, events) {
  for (const event of events) {
    await emitEvent(emit, event);
  }
}

/**
 * Check if an abort signal has been triggered.
 * @param {AbortSignal} [signal]
 * @returns {boolean}
 */
function isAborted(signal) {
  return signal?.aborted === true;
}

/**
 * Prepare tool call arguments, applying the tool's prepareArguments shim if present.
 * @param {import('./types').AgentTool} tool
 * @param {Object} rawArgs
 * @returns {Object}
 */
function prepareToolArgs(tool, rawArgs) {
  if (typeof tool.prepareArguments === 'function') {
    try {
      return tool.prepareArguments(rawArgs);
    } catch {
      return rawArgs; // Fall back to raw args on error
    }
  }
  return rawArgs;
}

/**
 * Execute a single tool call and return the result.
 * @param {import('./types').AgentTool} tool
 * @param {string} toolCallId
 * @param {Object} args
 * @param {AbortSignal} [signal]
 * @param {function(import('./types').AgentToolResult): void} [onUpdate]
 * @returns {Promise<import('./types').AgentToolResult>}
 */
async function executeSingleToolCall(tool, toolCallId, args, signal, onUpdate) {
  try {
    const result = await tool.execute(toolCallId, args, signal, onUpdate);
    return {
      content: result?.content ?? '',
      details: result?.details,
      isError: false,
    };
  } catch (err) {
    return errorToolResult(`Tool execution error: ${err.message || String(err)}`);
  }
}

/**
 * Execute tool calls sequentially.
 * @param {Array<{toolCallId: string, toolName: string, args: Object, thought?: string}>} toolCalls
 * @param {import('./types').AgentContext} context
 * @param {import('./types').AgentLoopConfig} config
 * @param {AbortSignal} [signal]
 * @param {function(import('./types').AgentEvent): Promise<void>|void} emit
 * @returns {Promise<import('./types').ToolResultMessage[]>}
 */
async function executeToolsSequential(toolCalls, context, config, signal, emit) {
  const results = [];

  for (const tc of toolCalls) {
    if (isAborted(signal)) {
      results.push(toolResultMessage(tc.toolCallId, tc.toolName, 'Tool execution aborted', { isError: true }));
      continue;
    }

    const tool = context.tools?.find((t) => t.name.toLowerCase() === tc.toolName.toLowerCase());
    if (!tool) {
      const msg = toolResultMessage(tc.toolCallId, tc.toolName, `Tool "${tc.toolName}" not found`, { isError: true });
      results.push(msg);
      continue;
    }

    // Emit start event
    await emitEvent(emit, {
      type: AgentEventType.TOOL_EXEC_START,
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: tc.args,
    });

    // Prepare args
    const preparedArgs = prepareToolArgs(tool, tc.args);

    // beforeToolCall hook
    let blocked = false;
    if (config.beforeToolCall) {
      try {
        const hookResult = await config.beforeToolCall(
          {
            assistantMessage: null, // Will be set by caller
            toolCall: { id: tc.toolCallId, name: tc.toolName, arguments: preparedArgs, thought: tc.thought },
            args: preparedArgs,
            context: { ...context },
          },
          signal
        );
        if (hookResult?.block) {
          blocked = true;
          const reason = hookResult.reason || 'Tool execution blocked by beforeToolCall hook';
          const msg = toolResultMessage(tc.toolCallId, tc.toolName, reason, { isError: true });
          results.push(msg);
          await emitEvent(emit, {
            type: AgentEventType.TOOL_EXEC_END,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            result: { content: reason, isError: true },
            isError: true,
          });
        }
      } catch (err) {
        blocked = true;
        const msg = toolResultMessage(tc.toolCallId, tc.toolName, `beforeToolCall error: ${err.message}`, { isError: true });
        results.push(msg);
        await emitEvent(emit, {
          type: AgentEventType.TOOL_EXEC_END,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          result: { content: `beforeToolCall error: ${err.message}`, isError: true },
          isError: true,
        });
      }
    }

    if (!blocked) {
      // Create update callback that emits TOOL_EXEC_UPDATE events
      const onUpdate = (partialResult) => {
        emitEvent(emit, {
          type: AgentEventType.TOOL_EXEC_UPDATE,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args,
          result: partialResult,
        });
      };

      // Execute
      const result = await executeSingleToolCall(tool, tc.toolCallId, preparedArgs, signal, onUpdate);

      // afterToolCall hook
      let finalResult = result;
      if (config.afterToolCall) {
        try {
          const hookResult = await config.afterToolCall(
            {
              assistantMessage: null,
              toolCall: { id: tc.toolCallId, name: tc.toolName, arguments: preparedArgs, thought: tc.thought },
              args: preparedArgs,
              result: { ...result },
              isError: Boolean(result.isError),
              context: { ...context },
            },
            signal
          );
          if (hookResult) {
            finalResult = {
              content: hookResult.content ?? result.content,
              details: hookResult.details ?? result.details,
              isError: hookResult.isError ?? result.isError,
            };
          }
        } catch {
          // Ignore afterToolCall errors, use original result
        }
      }

      const msg = toolResultMessage(tc.toolCallId, tc.toolName, finalResult.content, {
        isError: finalResult.isError,
      });
      results.push(msg);

      await emitEvent(emit, {
        type: AgentEventType.TOOL_EXEC_END,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result: finalResult,
        isError: Boolean(finalResult.isError),
      });
    }
  }

  return results;
}

/**
 * Execute tool calls in parallel (prepare sequentially, execute concurrently).
 * @param {Array<{toolCallId: string, toolName: string, args: Object, thought?: string}>} toolCalls
 * @param {import('./types').AgentContext} context
 * @param {import('./types').AgentLoopConfig} config
 * @param {AbortSignal} [signal]
 * @param {function(import('./types').AgentEvent): Promise<void>|void} emit
 * @returns {Promise<import('./types').ToolResultMessage[]>}
 */
async function executeToolsParallel(toolCalls, context, config, signal, emit) {
  const results = [];
  const runnableCalls = [];

  // Phase 1: Prepare all tool calls sequentially (validation + beforeToolCall hooks)
  for (const tc of toolCalls) {
    const tool = context.tools?.find((t) => t.name.toLowerCase() === tc.toolName.toLowerCase());
    if (!tool) {
      const msg = toolResultMessage(tc.toolCallId, tc.toolName, `Tool "${tc.toolName}" not found`, { isError: true });
      results.push(msg);
      await emitEvent(emit, {
        type: AgentEventType.TOOL_EXEC_START,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
      });
      await emitEvent(emit, {
        type: AgentEventType.TOOL_EXEC_END,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result: { content: `Tool "${tc.toolName}" not found`, isError: true },
        isError: true,
      });
      continue;
    }

    await emitEvent(emit, {
      type: AgentEventType.TOOL_EXEC_START,
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: tc.args,
    });

    const preparedArgs = prepareToolArgs(tool, tc.args);

    // beforeToolCall hook
    let blocked = false;
    if (config.beforeToolCall) {
      try {
        const hookResult = await config.beforeToolCall(
          {
            assistantMessage: null,
            toolCall: { id: tc.toolCallId, name: tc.toolName, arguments: preparedArgs, thought: tc.thought },
            args: preparedArgs,
            context: { ...context },
          },
          signal
        );
        if (hookResult?.block) {
          blocked = true;
          const reason = hookResult.reason || 'Tool execution blocked';
          const msg = toolResultMessage(tc.toolCallId, tc.toolName, reason, { isError: true });
          results.push(msg);
          await emitEvent(emit, {
            type: AgentEventType.TOOL_EXEC_END,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            result: { content: reason, isError: true },
            isError: true,
          });
        }
      } catch (err) {
        blocked = true;
        const msg = toolResultMessage(tc.toolCallId, tc.toolName, `beforeToolCall error: ${err.message}`, { isError: true });
        results.push(msg);
        await emitEvent(emit, {
          type: AgentEventType.TOOL_EXEC_END,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          result: { content: `beforeToolCall error: ${err.message}`, isError: true },
          isError: true,
        });
      }
    }

    if (!blocked) {
      runnableCalls.push({ ...tc, tool, preparedArgs });
    }
  }

  // Phase 2: Execute all runnable tool calls concurrently
  const executionPromises = runnableCalls.map(async (tc) => {
    const onUpdate = (partialResult) => {
      emitEvent(emit, {
        type: AgentEventType.TOOL_EXEC_UPDATE,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
        result: partialResult,
      });
    };

    const result = await executeSingleToolCall(tc.tool, tc.toolCallId, tc.preparedArgs, signal, onUpdate);

    // afterToolCall hook
    let finalResult = result;
    if (config.afterToolCall) {
      try {
        const hookResult = await config.afterToolCall(
          {
            assistantMessage: null,
            toolCall: { id: tc.toolCallId, name: tc.toolName, arguments: tc.preparedArgs, thought: tc.thought },
            args: tc.preparedArgs,
            result: { ...result },
            isError: Boolean(result.isError),
            context: { ...context },
          },
          signal
        );
        if (hookResult) {
          finalResult = {
            content: hookResult.content ?? result.content,
            details: hookResult.details ?? result.details,
            isError: hookResult.isError ?? result.isError,
          };
        }
      } catch {
        // Ignore afterToolCall errors
      }
    }

    return { tc, result: finalResult };
  });

  const executedResults = await Promise.all(executionPromises);

  // Phase 3: Collect results in original order
  for (const { tc, result } of executedResults) {
    const msg = toolResultMessage(tc.toolCallId, tc.toolName, result.content, {
      isError: result.isError,
    });
    results.push(msg);

    await emitEvent(emit, {
      type: AgentEventType.TOOL_EXEC_END,
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      result,
      isError: Boolean(result.isError),
    });
  }

  return results;
}

/**
 * Parse tool calls from an assistant response text.
 * The assistant response should be JSON with a segments array.
 * This function extracts tool call segments.
 *
 * @param {string} responseText - Raw assistant text (may contain JSON or plain text)
 * @returns {Array<{toolCallId: string, toolName: string, args: Object, thought?: string}>}
 */
function parseToolCallsFromResponse(responseText) {
  const toolCalls = [];

  // Try to parse as JSON
  try {
    const parsed = JSON.parse(responseText);

    // Look for segments array (agent protocol format)
    if (Array.isArray(parsed.segments)) {
      for (const segment of parsed.segments) {
        if (segment.type === 'tool' || segment.action === 'tool') {
          toolCalls.push({
            toolCallId: segment.id || `tc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            toolName: segment.tool || segment.name || '',
            args: segment.args || segment.arguments || segment.params || {},
            thought: segment.thought || segment.reasoning,
          });
        }
      }
    }

    // Also check for direct tool_call format
    if (parsed.type === 'tool_call' || parsed.action === 'tool_call') {
      toolCalls.push({
        toolCallId: parsed.id || `tc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        toolName: parsed.tool || parsed.name || '',
        args: parsed.args || parsed.arguments || parsed.params || {},
        thought: parsed.thought || parsed.reasoning,
      });
    }
  } catch {
    // Not JSON — check for legacy <|ACT ...|> tokens (backward compat)
    // NOTE: These are deprecated, but we keep minimal support during migration
    const actRegex = /<\|ACT\s+(\w+)\s+(.*?)\|>/g;
    let match;
    while ((match = actRegex.exec(responseText)) !== null) {
      toolCalls.push({
        toolCallId: `tc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        toolName: match[1].toLowerCase(),
        args: { raw: match[2] },
        thought: 'Legacy ACT token',
      });
    }
  }

  return toolCalls;
}

/**
 * Extract the text response from assistant output, excluding tool call metadata.
 * If the response is JSON with a text/content field, use that.
 * Otherwise, return the raw text.
 *
 * @param {string} responseText
 * @returns {string}
 */
function extractResponseText(responseText) {
  try {
    const parsed = JSON.parse(responseText);
    return parsed.text || parsed.content || parsed.response || responseText;
  } catch {
    return responseText;
  }
}

/**
 * Run the core agent loop.
 *
 * This is the main function — it orchestrates the full cycle:
 * LLM call → parse response → execute tools → append results → repeat.
 *
 * @param {import('./types').AgentContext} context - Agent context with systemPrompt, messages, tools
 * @param {import('./types').AgentLoopConfig} config - Loop configuration
 * @param {function(string, Object[]): Promise<{ok: boolean, text?: string, error?: string}>} streamFn - LLM streaming function
 * @param {function(import('./types').AgentEvent): Promise<void>|void} emit - Event callback
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<import('./types').AgentMessage[]>} Array of new messages produced during this run
 */
async function runAgentLoop(context, config, streamFn, emit, signal) {
  const newMessages = [];

  // Apply context transform if configured
  let currentMessages = [...context.messages];
  if (config.transformContext) {
    try {
      currentMessages = await config.transformContext(currentMessages, signal);
    } catch (err) {
      // On transform error, use original messages
      console.error('[agent-loop] transformContext error:', err.message);
    }
  }

  // Filter to LLM-visible messages only
  const llmMessages = filterLlmMessages(currentMessages);

  // Build LLM context
  const llmContext = {
    systemPrompt: context.systemPrompt || '',
    messages: llmMessages,
    tools: context.tools || [],
  };

  // Emit turn start
  await emitEvent(emit, { type: AgentEventType.TURN_START });

  // Call the LLM via streamFn
  let responseText = '';
  let streamError = null;

  try {
    const result = await streamFn(context.systemPrompt || '', llmMessages, context.tools || []);
    if (result.ok) {
      responseText = result.text || '';
    } else {
      streamError = result.error || 'LLM returned ok: false with no error message';
    }
  } catch (err) {
    streamError = err.message || String(err);
  }

  // Handle LLM error
  if (streamError) {
    const errorMsg = assistantMessage(`Error: ${streamError}`, {
      stopReason: 'error',
      errorMessage: streamError,
    });
    newMessages.push(errorMsg);

    await emitEvent(emit, {
      type: AgentEventType.MESSAGE_START,
      message: errorMsg,
    });
    await emitEvent(emit, {
      type: AgentEventType.MESSAGE_END,
      message: errorMsg,
    });
    await emitEvent(emit, {
      type: AgentEventType.TURN_END,
      message: errorMsg,
    });
    await emitEvent(emit, {
      type: AgentEventType.AGENT_END,
      messages: newMessages,
    });

    return newMessages;
  }

  // Parse tool calls from response
  const toolCalls = parseToolCallsFromResponse(responseText);
  const hasToolCalls = toolCalls.length > 0;

  // Create assistant message
  const assistantMsg = assistantMessage(extractResponseText(responseText), {
    toolCalls: hasToolCalls ? toolCalls : [],
    stopReason: hasToolCalls ? 'tool_use' : 'stop',
  });
  newMessages.push(assistantMsg);

  await emitEvent(emit, {
    type: AgentEventType.MESSAGE_START,
    message: assistantMsg,
  });
  await emitEvent(emit, {
    type: AgentEventType.MESSAGE_END,
    message: assistantMsg,
  });

  // If no tool calls, we're done
  if (!hasToolCalls) {
    await emitEvent(emit, {
      type: AgentEventType.TURN_END,
      message: assistantMsg,
    });
    await emitEvent(emit, {
      type: AgentEventType.AGENT_END,
      messages: newMessages,
    });
    return newMessages;
  }

  // Execute tool calls
  const executionMode = config.toolExecution || 'parallel';
  let toolResults;

  if (executionMode === 'sequential') {
    toolResults = await executeToolsSequential(toolCalls, context, config, signal, emit);
  } else {
    toolResults = await executeToolsParallel(toolCalls, context, config, signal, emit);
  }

  // Add tool results to newMessages
  for (const result of toolResults) {
    newMessages.push(result);
  }

  await emitEvent(emit, {
    type: AgentEventType.TURN_END,
    message: assistantMsg,
  });

  // Check for follow-up or steering messages
  // If there are more messages to process, continue the loop
  if (config.getSteeringMessages) {
    try {
      const steeringMessages = await config.getSteeringMessages();
      if (steeringMessages && steeringMessages.length > 0) {
        // Add steering to context and recurse
        const updatedContext = {
          ...context,
          messages: [...context.messages, ...newMessages, ...steeringMessages],
        };
        // Add steering messages to newMessages too
        for (const sm of steeringMessages) {
          newMessages.push(sm);
          await emitEvent(emit, {
            type: AgentEventType.MESSAGE_START,
            message: sm,
          });
          await emitEvent(emit, {
            type: AgentEventType.MESSAGE_END,
            message: sm,
          });
        }
        // Recurse for another turn
        const moreResults = await runAgentLoop(updatedContext, config, streamFn, emit, signal);
        newMessages.push(...moreResults);
      }
    } catch (err) {
      console.error('[agent-loop] getSteeringMessages error:', err.message);
    }
  }

  // Check for follow-up messages
  if (config.getFollowUpMessages) {
    try {
      const followUpMessages = await config.getFollowUpMessages();
      if (followUpMessages && followUpMessages.length > 0) {
        const updatedContext = {
          ...context,
          messages: [...context.messages, ...newMessages, ...followUpMessages],
        };
        for (const fum of followUpMessages) {
          newMessages.push(fum);
          await emitEvent(emit, {
            type: AgentEventType.MESSAGE_START,
            message: fum,
          });
          await emitEvent(emit, {
            type: AgentEventType.MESSAGE_END,
            message: fum,
          });
        }
        const moreResults = await runAgentLoop(updatedContext, config, streamFn, emit, signal);
        newMessages.push(...moreResults);
      }
    } catch (err) {
      console.error('[agent-loop] getFollowUpMessages error:', err.message);
    }
  }

  await emitEvent(emit, {
    type: AgentEventType.AGENT_END,
    messages: newMessages,
  });

  return newMessages;
}

module.exports = {
  runAgentLoop,
  parseToolCallsFromResponse,
  extractResponseText,
  executeToolsSequential,
  executeToolsParallel,
  executeSingleToolCall,
  prepareToolArgs,
  isAborted,
};
