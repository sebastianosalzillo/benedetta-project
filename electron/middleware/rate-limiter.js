/**
 * @fileoverview Rate limiting middleware — throttles tool call frequency.
 *
 * This is a beforeToolCall hook implementation.
 * It tracks tool call timestamps and blocks calls that exceed the configured
 * rate limit (calls per time window).
 *
 * Usage with Agent:
 * ```js
 * const { createRateLimiterMiddleware } = require('./middleware/rate-limiter');
 *
 * const limiter = createRateLimiterMiddleware({
 *   // Global limit: 30 calls per minute
 *   globalMaxCalls: 30,
 *   globalWindowMs: 60000,
 *   // Per-tool limits
 *   perToolLimits: {
 *     shell: { maxCalls: 10, windowMs: 60000 },     // 10 shell calls/min
 *     web_fetch: { maxCalls: 20, windowMs: 60000 },  // 20 fetches/min
 *     web_search: { maxCalls: 15, windowMs: 60000 }, // 15 searches/min
 *   },
 * });
 *
 * const agent = new Agent({
 *   beforeToolCall: limiter,
 * });
 * ```
 *
 * @module middleware/rate-limiter
 */

/**
 * Default configuration.
 */
const DEFAULTS = {
  /** Global max tool calls per window */
  globalMaxCalls: 60,
  /** Global window in milliseconds (1 minute) */
  globalWindowMs: 60 * 1000,
  /** Per-tool limits: tool name -> { maxCalls, windowMs } */
  perToolLimits: {},
};

/**
 * @typedef {Object} RateLimiterOptions
 * @property {number} [globalMaxCalls=60] - Global max tool calls per window
 * @property {number} [globalWindowMs=60000] - Global window in ms
 * @property {Object<string, {maxCalls: number, windowMs: number}>} [perToolLimits] - Per-tool limits
 */

/**
 * Timestamps of recent tool calls (for global limiting).
 * @type {number[]}
 */
let _globalCallTimestamps = [];

/**
 * Per-tool call timestamps.
 * @type {Map<string, number[]>}
 */
let _toolCallTimestamps = new Map();

/**
 * Create a rate limiter middleware.
 * @param {RateLimiterOptions} [options]
 * @returns {import('../agent/types').AgentLoopConfig['beforeToolCall']}
 */
function createRateLimiterMiddleware(options = {}) {
  const config = { ...DEFAULTS, ...options };

  return async function beforeToolCall(context, _signal) {
    const toolName = context.toolCall?.name || '';
    const now = Date.now();

    // 1. Check global rate limit
    const globalResult = checkRateLimit(_globalCallTimestamps, config.globalMaxCalls, config.globalWindowMs, now);
    if (!globalResult.allowed) {
      return {
        block: true,
        reason: `Rate limit raggiunto: max ${config.globalMaxCalls} chiamate tool ogni ${config.globalWindowMs / 1000}s. Riprova più tardi.`,
      };
    }

    // 2. Check per-tool rate limit
    if (config.perToolLimits[toolName]) {
      const toolLimit = config.perToolLimits[toolName];
      if (!_toolCallTimestamps.has(toolName)) {
        _toolCallTimestamps.set(toolName, []);
      }
      const toolTimestamps = _toolCallTimestamps.get(toolName);
      const toolResult = checkRateLimit(toolTimestamps, toolLimit.maxCalls, toolLimit.windowMs, now);
      if (!toolResult.allowed) {
        return {
          block: true,
          reason: `Rate limit raggiunto per tool "${toolName}": max ${toolLimit.maxCalls} chiamate ogni ${toolLimit.windowMs / 1000}s. Riprova più tardi.`,
        };
      }
    }

    // Record this call (only if we're about to allow it — the actual execution
    // will happen after this hook returns. We record preemptively to prevent
    // race conditions within the same batch.)
    _globalCallTimestamps.push(now);
    if (config.perToolLimits[toolName] && _toolCallTimestamps.has(toolName)) {
      _toolCallTimestamps.get(toolName).push(now);
    }

    return undefined; // Allow
  };
}

/**
 * Check if a call is allowed under the given rate limit.
 * @param {number[]} timestamps - Array of recent call timestamps
 * @param {number} maxCalls - Max calls allowed in window
 * @param {number} windowMs - Window size in ms
 * @param {number} now - Current timestamp
 * @returns {{allowed: boolean, remaining: number}}
 */
function checkRateLimit(timestamps, maxCalls, windowMs, now) {
  // Remove expired timestamps
  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  const remaining = Math.max(0, maxCalls - timestamps.length);
  const allowed = timestamps.length < maxCalls;

  return { allowed, remaining };
}

/**
 * Reset all rate limiter state.
 */
function resetRateLimiter() {
  _globalCallTimestamps = [];
  _toolCallTimestamps.clear();
}

/**
 * Get current rate limiter status.
 * @param {RateLimiterOptions} [options]
 * @returns {Object}
 */
function getRateLimiterStatus(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const now = Date.now();
  const cutoff = now - config.globalWindowMs;

  // Clean and count global
  _globalCallTimestamps = _globalCallTimestamps.filter((t) => t >= cutoff);

  const status = {
    global: {
      callsInWindow: _globalCallTimestamps.length,
      maxCalls: config.globalMaxCalls,
      remaining: Math.max(0, config.globalMaxCalls - _globalCallTimestamps.length),
      windowMs: config.globalWindowMs,
    },
    perTool: {},
  };

  // Per-tool status
  for (const [toolName, limit] of Object.entries(config.perToolLimits)) {
    if (!_toolCallTimestamps.has(toolName)) {
      _toolCallTimestamps.set(toolName, []);
    }
    const toolCutoff = now - limit.windowMs;
    const toolTimestamps = _toolCallTimestamps.get(toolName);
    toolTimestamps.splice(0, toolTimestamps.length, ...toolTimestamps.filter((t) => t >= toolCutoff));

    status.perTool[toolName] = {
      callsInWindow: toolTimestamps.length,
      maxCalls: limit.maxCalls,
      remaining: Math.max(0, limit.maxCalls - toolTimestamps.length),
      windowMs: limit.windowMs,
    };
  }

  return status;
}

module.exports = {
  createRateLimiterMiddleware,
  resetRateLimiter,
  getRateLimiterStatus,
  checkRateLimit,
};
