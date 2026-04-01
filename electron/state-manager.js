const { randomUUID } = require('crypto');
const { STREAM_STATUS, MAX_CHAT_HISTORY } = require('./constants');

/**
 * Thread-safe state manager for ACP chat requests.
 * Replaces global mutable variables with a locked state machine
 * to prevent race conditions between concurrent async operations.
 */
class ChatRequestManager {
  constructor() {
    this._activeRequest = null;
    this._activeResponseId = null;
    this._lock = false;
    this._pendingLocks = [];
  }

  async _acquireLock() {
    return new Promise((resolve) => {
      if (!this._lock) {
        this._lock = true;
        resolve();
        return;
      }
      this._pendingLocks.push(resolve);
    });
  }

  _releaseLock() {
    this._lock = false;
    const next = this._pendingLocks.shift();
    if (next) {
      this._lock = true;
      next();
    }
  }

  get activeRequest() {
    return this._activeRequest;
  }

  get activeResponseId() {
    return this._activeResponseId;
  }

  get isBusy() {
    return this._activeRequest !== null || this._activeResponseId !== null;
  }

  /**
   * Start a new chat request. Returns null if another request is already running.
   */
  async startRequest(userText, options = {}) {
    await this._acquireLock();
    try {
      if (this._activeRequest) {
        return { ok: false, error: 'Another response is already running' };
      }

      const requestId = `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const controller = new AbortController();

      this._activeRequest = {
        id: requestId,
        proc: null,
        abortController: controller,
        cancelFn: null,
        cancelled: false,
        stopReason: null,
        buffer: '',
        preview: '',
        acpSessionId: null,
        acpSessionNew: false,
        streamEmitter: null,
        ...options,
      };

      this._activeResponseId = requestId;
      return { ok: true, requestId, request: this._activeRequest };
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Safely stop the active request.
   */
  async stopRequest(reason = 'stopped') {
    await this._acquireLock();
    try {
      if (this._activeRequest) {
        this._activeRequest.cancelled = true;
        this._activeRequest.stopReason = reason;
        this._activeRequest.streamEmitter?.stop();

        if (this._activeRequest.cancelFn) {
          try {
            void Promise.resolve(this._activeRequest.cancelFn(reason)).catch(() => null);
          } catch {
            // ignore cancel callback errors
          }
        }

        if (this._activeRequest.proc) {
          try {
            this._activeRequest.proc.kill();
          } catch {
            // ignore kill errors
          }
        }

        if (this._activeRequest.abortController) {
          try {
            this._activeRequest.abortController.abort();
          } catch {
            // ignore abort errors
          }
        }

        const reqId = this._activeRequest.id;
        this._activeRequest = null;
        this._activeResponseId = null;
        return { ok: true, requestId: reqId };
      }

      if (this._activeResponseId) {
        const reqId = this._activeResponseId;
        this._activeResponseId = null;
        return { ok: true, requestId: reqId };
      }

      return { ok: false, error: 'No active request' };
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Check if a specific request is still active (not cancelled).
   */
  isRequestActive(requestId) {
    return this._activeRequest?.id === requestId && !this._activeRequest.cancelled;
  }

  /**
   * Check if a request has been cancelled.
   */
  isRequestCancelled(requestId) {
    return !this._activeRequest || this._activeRequest.id !== requestId || Boolean(this._activeRequest.cancelled);
  }

  /**
   * Update the active request's stream emitter.
   */
  async setStreamEmitter(requestId, emitter) {
    await this._acquireLock();
    try {
      if (this._activeRequest?.id === requestId) {
        this._activeRequest.streamEmitter = emitter;
      }
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Update the active request's process handle.
   */
  async setProcess(requestId, proc) {
    await this._acquireLock();
    try {
      if (this._activeRequest?.id === requestId) {
        this._activeRequest.proc = proc;
      }
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Update the active request's cancel function.
   */
  async setCancelFn(requestId, cancelFn) {
    await this._acquireLock();
    try {
      if (this._activeRequest?.id === requestId) {
        this._activeRequest.cancelFn = cancelFn;
      }
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Update ACP session info on the active request.
   */
  async setAcpSession(requestId, sessionId, isNew) {
    await this._acquireLock();
    try {
      if (this._activeRequest?.id === requestId) {
        this._activeRequest.acpSessionId = sessionId;
        this._activeRequest.acpSessionNew = isNew;
      }
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Clear the active request after completion (without cancelling).
   */
  async clearActiveRequest() {
    await this._acquireLock();
    try {
      this._activeRequest = null;
      this._activeResponseId = null;
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Get the current active request ID for playback tracking.
   */
  getActiveResponseId() {
    return this._activeResponseId;
  }

  /**
   * Set the active response ID for playback tracking.
   */
  async setActiveResponseId(requestId) {
    await this._acquireLock();
    try {
      this._activeResponseId = requestId;
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Clear the active response ID.
   */
  async clearActiveResponseId() {
    await this._acquireLock();
    try {
      this._activeResponseId = null;
    } finally {
      this._releaseLock();
    }
  }
}

/**
 * Playback waiter manager with proper cleanup.
 * Prevents memory leaks from orphaned waiter promises.
 */
class PlaybackWaiterManager {
  constructor() {
    this._waiters = new Map();
    this._globalTimeouts = new Map();
  }

  /**
   * Register a playback waiter with automatic cleanup.
   */
  waitForPlayback(requestId, segmentId, fallbackMs) {
    const key = `${requestId}::${segmentId}`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this._waiters.delete(key);
        this._globalTimeouts.delete(key);
        resolve(false);
      }, Math.max(1000, fallbackMs));

      this._waiters.set(key, { requestId, timeout, resolve });
      this._globalTimeouts.set(key, timeout);
    });
  }

  /**
   * Resolve a specific waiter.
   */
  resolveWaiter(requestId, segmentId, result) {
    const key = `${requestId}::${segmentId}`;
    const waiter = this._waiters.get(key);
    if (!waiter) return;
    clearTimeout(waiter.timeout);
    this._waiters.delete(key);
    this._globalTimeouts.delete(key);
    waiter.resolve(result);
  }

  /**
   * Resolve all waiters for a given request.
   */
  resolveAllForRequest(requestId, result) {
    for (const [key, waiter] of this._waiters.entries()) {
      if (waiter.requestId === requestId) {
        clearTimeout(waiter.timeout);
        this._waiters.delete(key);
        this._globalTimeouts.delete(key);
        waiter.resolve(result);
      }
    }
  }

  /**
   * Clear all waiters (cleanup on shutdown).
   */
  clearAll() {
    for (const timeout of this._globalTimeouts.values()) {
      clearTimeout(timeout);
    }
    this._waiters.clear();
    this._globalTimeouts.clear();
  }

  get size() {
    return this._waiters.size;
  }
}

/**
 * Speech reset timer manager.
 */
class SpeechResetManager {
  constructor(onReset, defaultMs = 5000) {
    this._onReset = onReset;
    this._defaultMs = defaultMs;
    this._timer = null;
  }

  start(ms) {
    this.clear();
    this._timer = setTimeout(() => {
      this._timer = null;
      this._onReset?.();
    }, ms ?? this._defaultMs);
  }

  clear() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}

/**
 * Stream status manager with broadcast callback.
 */
class StatusManager {
  constructor(onBroadcast) {
    this._status = 'idle';
    this._brainMode = 'booting';
    this._streamStatus = STREAM_STATUS.DISCONNECTED;
    this._ttsStatus = 'idle';
    this._ttsLatencyMs = null;
    this._ttsLastError = null;
    this._onBroadcast = onBroadcast;
  }

  setStatus(status) {
    this._status = status;
    this._broadcast();
  }

  setBrainMode(mode) {
    this._brainMode = mode;
    this._broadcast();
  }

  setStreamStatus(status) {
    this._streamStatus = status;
    this._broadcast();
  }

  setTtsState(status, options = {}) {
    this._ttsStatus = status;
    if (Object.prototype.hasOwnProperty.call(options, 'latencyMs')) {
      this._ttsLatencyMs = options.latencyMs;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'error')) {
      this._ttsLastError = options.error;
    }
    this._broadcast();
  }

  get status() { return this._status; }
  get brainMode() { return this._brainMode; }
  get streamStatus() { return this._streamStatus; }
  get ttsStatus() { return this._ttsStatus; }
  get ttsLatencyMs() { return this._ttsLatencyMs; }
  get ttsLastError() { return this._ttsLastError; }

  getState() {
    return {
      status: this._status,
      brainMode: this._brainMode,
      streamStatus: this._streamStatus,
      ttsStatus: this._ttsStatus,
      ttsLatencyMs: this._ttsLatencyMs,
      ttsLastError: this._ttsLastError,
    };
  }

  _broadcast() {
    this._onBroadcast?.();
  }
}

/**
 * Stream emitter with adaptive EMA-based flushing.
 */
function createStreamEmitter(requestId, config = {}) {
  const {
    initialIntervalMs = 40,
    minIntervalMs = 24,
    maxIntervalMs = 140,
    emaAlpha = 0.8,
    onFlush,
  } = config;

  let lastBurstTime = Date.now();
  let emaIntervalMs = initialIntervalMs;
  let pendingText = '';
  let flushTimer = null;

  function flush() {
    if (!pendingText) return;
    const text = pendingText;
    pendingText = '';
    onFlush?.(text);
  }

  return {
    lastBurstTime: Date.now(),
    emaIntervalMs,
    pendingText: '',
    flushTimer: null,
    queue(text) {
      const delta = String(text || '');
      if (!delta) return;

      const now = Date.now();
      const elapsed = Math.max(1, now - lastBurstTime);
      const rawInterval = elapsed / Math.max(1, delta.length);
      emaIntervalMs = Math.max(minIntervalMs, Math.min(maxIntervalMs, Math.round(emaAlpha * emaIntervalMs + (1 - emaAlpha) * rawInterval * 10)));
      lastBurstTime = now;
      pendingText += delta;

      if (flushTimer) {
        return;
      }

      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, emaIntervalMs);
    },
    flush() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush();
    },
    stop() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush();
    },
  };
}

module.exports = {
  ChatRequestManager,
  PlaybackWaiterManager,
  SpeechResetManager,
  StatusManager,
  createStreamEmitter,
};
