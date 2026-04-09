/**
 * @fileoverview Circuit breaker middleware — skips failing tools after consecutive errors.
 *
 * Wraps the existing circuit-breaker.js logic into a beforeToolCall hook.
 * Each tool has its own circuit breaker state.
 *
 * Usage with Agent:
 * ```js
 * const { createCircuitBreakerMiddleware } = require('./middleware/circuit-breaker-mw');
 *
 * const agent = new Agent({
 *   beforeToolCall: createCircuitBreakerMiddleware(),
 *   afterToolCall: createCircuitBreakerAfterHook(),  // Record success/failure
 * });
 * ```
 *
 * @module middleware/circuit-breaker-mw
 */

const {
  createDefaultCircuitBreakerState,
  recordSuccess,
  recordFailure,
  resetCircuitBreaker,
  getCircuitBreakerStatus,
  canExecute,
  MAX_CONSECUTIVE_FAILURES,
} = require('../circuit-breaker');

/**
 * Per-tool circuit breaker state map.
 * Key: tool name, Value: circuit breaker state object.
 * @type {Map<string, ReturnType<typeof createDefaultCircuitBreakerState>>}
 */
const _toolStates = new Map();

/**
 * Get or create circuit breaker state for a tool.
 * @param {string} toolName
 * @returns {ReturnType<typeof createDefaultCircuitBreakerState>}
 */
function getToolState(toolName) {
  if (!_toolStates.has(toolName)) {
    _toolStates.set(toolName, createDefaultCircuitBreakerState());
  }
  return _toolStates.get(toolName);
}

/**
 * Reset circuit breaker for a specific tool.
 * @param {string} toolName
 * @returns {Object} Result from resetCircuitBreaker
 */
function resetToolCircuitBreaker(toolName) {
  const state = getToolState(toolName);
  return resetCircuitBreaker(state);
}

/**
 * Reset ALL circuit breakers.
 */
function resetAllCircuitBreakers() {
  _toolStates.clear();
}

/**
 * Get circuit breaker status for a specific tool.
 * @param {string} toolName
 * @returns {Object|null}
 */
function getToolCircuitStatus(toolName) {
  const state = _toolStates.get(toolName);
  if (!state) return null;
  return getCircuitBreakerStatus(state);
}

/**
 * Get all circuit breaker statuses.
 * @returns {Object<string, Object>}
 */
function getAllCircuitStatuses() {
  const result = {};
  for (const [name, state] of _toolStates.entries()) {
    result[name] = getCircuitBreakerStatus(state);
  }
  return result;
}

// ============================================================
// Middleware factory
// ============================================================

/**
 * Create a beforeToolCall middleware for circuit breaker checks.
 *
 * If a tool's circuit breaker is tripped (consecutive failures >= threshold),
 * the tool call is blocked immediately without execution.
 *
 * @returns {import('../agent/types').AgentLoopConfig['beforeToolCall']}
 */
function createCircuitBreakerMiddleware() {
  return async function beforeToolCall(context, _signal) {
    const toolName = context.toolCall?.name || '';
    if (!toolName) return undefined;

    const state = getToolState(toolName);

    if (!canExecute(state)) {
      const status = getCircuitBreakerStatus(state);
      return {
        block: true,
        reason: `Circuit breaker tripped for tool "${toolName}" (${status.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} consecutive failures). Last error: ${status.lastFailureReason}`,
      };
    }

    return undefined; // Allow execution
  };
}

/**
 * Create an afterToolCall middleware for recording tool success/failure.
 *
 * This should be used IN ADDITION to the beforeToolCall middleware.
 * It records the outcome so the circuit breaker state stays accurate.
 *
 * @returns {import('../agent/types').AgentLoopConfig['afterToolCall']}
 */
function createCircuitBreakerAfterHook() {
  return async function afterToolCall(context, _signal) {
    const toolName = context.toolCall?.name || '';
    if (!toolName) return undefined;

    const state = getToolState(toolName);

    if (context.isError) {
      recordFailure(state, context.result?.content || 'Unknown error');
    } else {
      recordSuccess(state);
    }

    // Don't override the result, just record
    return undefined;
  };
}

module.exports = {
  createCircuitBreakerMiddleware,
  createCircuitBreakerAfterHook,
  resetToolCircuitBreaker,
  resetAllCircuitBreakers,
  getToolCircuitStatus,
  getAllCircuitStatuses,
  getToolState,
  MAX_CONSECUTIVE_FAILURES,
};
