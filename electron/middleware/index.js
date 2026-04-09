/**
 * @fileoverview Middleware barrel + composition utilities.
 *
 * Provides:
 * - Re-exports of all middleware factories
 * - composeBeforeTools: combine multiple beforeToolCall hooks into one
 * - composeAfterTools: combine multiple afterToolCall hooks into one
 *
 * Usage:
 * ```js
 * const { composeMiddleware, composeAfterHooks } = require('./middleware');
 * const { createApprovalMiddleware } = require('./middleware/tool-approval');
 * const { createCircuitBreakerMiddleware } = require('./middleware/circuit-breaker-mw');
 * const { createRateLimiterMiddleware } = require('./middleware/rate-limiter');
 *
 * // Combine multiple beforeToolCall hooks
 * const beforeFn = composeMiddleware([
 *   createCircuitBreakerMiddleware(),   // 1. Check circuit breaker
 *   createRateLimiterMiddleware(),      // 2. Check rate limit
 *   createApprovalMiddleware(),         // 3. Ask for user approval
 * ]);
 *
 * const agent = new Agent({
 *   beforeToolCall: beforeFn,
 *   afterToolCall: composeAfterHooks([
 *     createCircuitBreakerAfterHook(),  // 1. Record success/failure
 *     createSanitizerMiddleware(),      // 2. Sanitize output
 *   ]),
 * });
 * ```
 *
 * @module middleware
 */

const {
  createApprovalMiddleware,
  setApprover,
  clearApprover,
  isDangerousTool,
  getDangerReason,
  isHardBlocked,
  DANGEROUS_TOOLS,
} = require('./tool-approval');

const {
  createSanitizerMiddleware,
  sanitizeString,
  ANSI_ESCAPE,
  HIDDEN_CHARS,
  BINARY_MARKERES,
  STACK_TRACE,
  ENV_SECRETS,
} = require('./output-sanitizer');

const {
  createCircuitBreakerMiddleware,
  createCircuitBreakerAfterHook,
  resetToolCircuitBreaker,
  resetAllCircuitBreakers,
  getToolCircuitStatus,
  getAllCircuitStatuses,
} = require('./circuit-breaker-mw');

const {
  createRateLimiterMiddleware,
  resetRateLimiter,
  getRateLimiterStatus,
} = require('./rate-limiter');

// ============================================================
// Middleware composition utilities
// ============================================================

/**
 * Compose multiple beforeToolCall hooks into a single function.
 *
 * Execution order: hooks run in array order. The first hook that returns
 * { block: true } short-circuits and blocks the tool call.
 * If all hooks return undefined, the tool call is allowed.
 *
 * @param {Array<import('../agent/types').AgentLoopConfig['beforeToolCall']>} hooks
 * @returns {import('../agent/types').AgentLoopConfig['beforeToolCall']}
 */
function composeMiddleware(hooks) {
  const validHooks = hooks.filter(Boolean);

  if (validHooks.length === 0) {
    return undefined;
  }

  if (validHooks.length === 1) {
    return validHooks[0];
  }

  return async function composedBeforeToolCall(context, signal) {
    for (const hook of validHooks) {
      try {
        const result = await hook(context, signal);
        if (result) {
          return result; // Short-circuit on first block/reason
        }
      } catch (err) {
        // If a hook throws, block for safety
        return {
          block: true,
          reason: `Middleware error: ${err.message}`,
        };
      }
    }
    return undefined; // All hooks passed
  };
}

/**
 * Compose multiple afterToolCall hooks into a single function.
 *
 * Execution order: hooks run in array order. Each hook can override
 * the previous hook's result. The last hook's return value wins.
 * If a hook returns undefined, the previous result is preserved.
 *
 * @param {Array<import('../agent/types').AgentLoopConfig['afterToolCall']>} hooks
 * @returns {import('../agent/types').AgentLoopConfig['afterToolCall']}
 */
function composeAfterHooks(hooks) {
  const validHooks = hooks.filter(Boolean);

  if (validHooks.length === 0) {
    return undefined;
  }

  if (validHooks.length === 1) {
    return validHooks[0];
  }

  return async function composedAfterToolCall(context, signal) {
    let accumulatedResult = undefined;

    for (const hook of validHooks) {
      try {
        // Create a context snapshot with the accumulated result so far
        const ctx = {
          ...context,
          result: accumulatedResult?.content !== undefined
            ? { ...context.result, content: accumulatedResult.content }
            : context.result,
          isError: accumulatedResult?.isError !== undefined
            ? accumulatedResult.isError
            : context.isError,
        };

        const result = await hook(ctx, signal);
        if (result) {
          // Merge this hook's result with accumulated
          accumulatedResult = {
            content: result.content ?? accumulatedResult?.content ?? context.result.content,
            details: result.details ?? accumulatedResult?.details,
            isError: result.isError ?? accumulatedResult?.isError ?? context.isError,
          };
        }
      } catch (err) {
        // If a hook throws, log but continue to next hook
        console.error('[middleware] afterToolCall hook error:', err.message);
      }
    }

    return accumulatedResult;
  };
}

// ============================================================
// Convenience: create a full middleware stack with defaults
// ============================================================

/**
 * Create a complete beforeToolCall middleware stack with sensible defaults.
 * Includes: circuit breaker → rate limiter → approval gate.
 *
 * @param {Object} [options]
 * @param {Object} [options.rateLimiter] - Options passed to createRateLimiterMiddleware
 * @param {boolean} [options.enableApproval=true] - Whether to include the approval gate
 * @param {boolean} [options.enableCircuitBreaker=true] - Whether to include circuit breaker
 * @param {boolean} [options.enableRateLimiter=true] - Whether to include rate limiter
 * @returns {import('../agent/types').AgentLoopConfig['beforeToolCall']}
 */
function createDefaultBeforeMiddleware(options = {}) {
  const {
    enableCircuitBreaker = true,
    enableRateLimiter = true,
    enableApproval = true,
    rateLimiter = {},
  } = options;

  const hooks = [];

  if (enableCircuitBreaker) {
    hooks.push(createCircuitBreakerMiddleware());
  }

  if (enableRateLimiter) {
    hooks.push(createRateLimiterMiddleware(rateLimiter));
  }

  if (enableApproval) {
    hooks.push(createApprovalMiddleware());
  }

  return composeMiddleware(hooks);
}

/**
 * Create a complete afterToolCall middleware stack with sensible Defaults.
 * Includes: circuit breaker recorder → output sanitizer.
 *
 * @param {Object} [options]
 * @param {Object} [options.sanitizer] - Options passed to createSanitizerMiddleware
 * @param {boolean} [options.enableCircuitBreaker=true] - Whether to include circuit breaker recorder
 * @param {boolean} [options.enableSanitizer=true] - Whether to include output sanitizer
 * @returns {import('../agent/types').AgentLoopConfig['afterToolCall']}
 */
function createDefaultAfterMiddleware(options = {}) {
  const {
    enableCircuitBreaker = true,
    enableSanitizer = true,
    sanitizer = {},
  } = options;

  const hooks = [];

  if (enableCircuitBreaker) {
    hooks.push(createCircuitBreakerAfterHook());
  }

  if (enableSanitizer) {
    hooks.push(createSanitizerMiddleware(sanitizer));
  }

  return composeAfterHooks(hooks);
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Composition utilities
  composeMiddleware,
  composeAfterHooks,

  // Convenience factories
  createDefaultBeforeMiddleware,
  createDefaultAfterMiddleware,

  // Tool approval
  createApprovalMiddleware,
  setApprover,
  clearApprover,
  isDangerousTool,
  getDangerReason,
  isHardBlocked,
  DANGEROUS_TOOLS,

  // Output sanitizer
  createSanitizerMiddleware,
  sanitizeString,
  ANSI_ESCAPE,
  HIDDEN_CHARS,
  BINARY_MARKERES,
  STACK_TRACE,
  ENV_SECRETS,

  // Circuit breaker
  createCircuitBreakerMiddleware,
  createCircuitBreakerAfterHook,
  resetToolCircuitBreaker,
  resetAllCircuitBreakers,
  getToolCircuitStatus,
  getAllCircuitStatuses,

  // Rate limiter
  createRateLimiterMiddleware,
  resetRateLimiter,
  getRateLimiterStatus,
};
