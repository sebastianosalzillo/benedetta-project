const { spawn } = require('child_process');
const path = require('path');
const {
  KOKORO_SERVER_SCRIPT,
  KOKORO_PYTHON,
  KOKORO_HOST,
  KOKORO_PORT,
  KOKORO_URL,
  KOKORO_DEFAULT_SPEAKER,
  KOKORO_STARTUP_TIMEOUT_MS,
  TTS_SERVICE_POLL_MS,
  MAX_TTS_LOG_TAIL,
  MAX_PROMPT_LINE_LENGTH,
} = require('./constants');
const fs = require('fs');

/**
 * Normalize a line of text to a max length.
 */
function normalizeLine(text, maxLength) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Kokoro TTS Service with caching and auto-restart.
 */
class TtsService {
  constructor(options = {}) {
    this._process = null;
    this._startupPromise = null;
    this._logTail = '';
    this._status = 'idle';
    this._latencyMs = null;
    this._lastError = null;
    this._cache = new Map();
    this._cacheMaxSize = options.cacheMaxSize || 200;
    this._host = options.host || KOKORO_HOST;
    this._port = options.port || KOKORO_PORT;
    this._url = options.url || KOKORO_URL;
    this._speaker = options.speaker || KOKORO_DEFAULT_SPEAKER;
    this._python = options.python || KOKORO_PYTHON;
    this._script = options.script || KOKORO_SERVER_SCRIPT;
    this._startupTimeout = options.startupTimeout || KOKORO_STARTUP_TIMEOUT_MS;
    this._onStatusChange = options.onStatusChange;
  }

  get status() { return this._status; }
  get latencyMs() { return this._latencyMs; }
  get lastError() { return this._lastError; }
  get cacheSize() { return this._cache.size; }

  _appendLog(chunk, source) {
    const line = `[${source}] ${String(chunk || '').trim()}`;
    if (!line.trim()) return;
    this._logTail = `${this._logTail}\n${line}`.trim().slice(-MAX_TTS_LOG_TAIL);
  }

  async _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async _probeHealth() {
    try {
      const response = await fetch(`${this._url}/health`);
      if (!response.ok) return null;
      const data = await response.json();
      return data?.ready ? data : null;
    } catch {
      return null;
    }
  }

  _stop() {
    if (!this._process) return;
    try {
      this._process.kill();
    } catch {
      // ignore kill errors
    }
    this._process = null;
  }

  async ensure() {
    const healthy = await this._probeHealth();
    if (healthy) {
      this._status = 'ready';
      this._lastError = null;
      return healthy;
    }

    if (this._startupPromise) {
      return this._startupPromise;
    }

    this._startupPromise = this._start();
    try {
      return await this._startupPromise;
    } finally {
      this._startupPromise = null;
    }
  }

  async _start() {
    this._status = 'loading';
    this._lastError = null;
    this._logTail = '';

    if (!fs.existsSync(this._script)) {
      throw new Error(`Kokoro server script not found: ${this._script}`);
    }

    if (!fs.existsSync(this._python)) {
      throw new Error(`Kokoro Python not found: ${this._python}`);
    }

    if (this._process) {
      this._stop();
    }

    this._process = spawn(this._python, ['-u', this._script], {
      cwd: path.join(__dirname, '..'),
      windowsHide: true,
      env: {
        ...process.env,
        KOKORO_HOST: this._host,
        KOKORO_PORT: String(this._port),
        KOKORO_DEFAULT_SPEAKER: this._speaker,
        KOKORO_PYTHON: this._python,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this._process.stdout.on('data', (chunk) => this._appendLog(chunk, 'stdout'));
    this._process.stderr.on('data', (chunk) => this._appendLog(chunk, 'stderr'));
    this._process.on('exit', (code, signal) => {
      this._appendLog(`process exited code=${code} signal=${signal}`, 'exit');
      this._process = null;
    });
    this._process.on('error', (error) => {
      this._appendLog(error.message, 'spawn-error');
    });

    const startedAt = Date.now();
    while (Date.now() - startedAt < this._startupTimeout) {
      const data = await this._probeHealth();
      if (data) {
        this._status = 'ready';
        this._lastError = null;
        this._onStatusChange?.('ready');
        return data;
      }

      if (!this._process) {
        throw new Error(`Kokoro service exited before becoming ready.\n${this._logTail}`);
      }

      await this._sleep(TTS_SERVICE_POLL_MS);
    }

    throw new Error(`Kokoro startup timeout after ${this._startupTimeout} ms.\n${this._logTail}`);
  }

  /**
   * Synthesize speech to base64 audio.
   * Uses cache for repeated text to avoid redundant API calls.
   */
  async synthesize(text) {
    const safeText = String(text || '').trim();
    if (!safeText) return null;

    // Check cache
    const cacheKey = `${this._speaker}:${safeText}`;
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    const startedAt = Date.now();
    this._status = 'loading';
    this._lastError = null;
    this._onStatusChange?.('loading');

    await this.ensure();

    const response = await fetch(`${this._url}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: safeText,
        voice: this._speaker,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.audio_base64) {
      const errorMessage = data?.detail || `Kokoro synth failed with status ${response.status}`;
      this._status = 'error';
      this._lastError = errorMessage;
      this._onStatusChange?.('error', errorMessage);
      throw new Error(errorMessage);
    }

    this._latencyMs = Date.now() - startedAt;
    this._status = 'ready';
    this._lastError = null;
    this._onStatusChange?.('ready', { latencyMs: this._latencyMs });

    // Cache result
    if (this._cache.size >= this._cacheMaxSize) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }
    this._cache.set(cacheKey, data.audio_base64);

    return data.audio_base64;
  }

  /**
   * Clear the TTS cache.
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * Stop the TTS service.
   */
  stop() {
    this._stop();
    this._startupPromise = null;
    this._status = 'idle';
    this._onStatusChange?.('idle');
  }

  /**
   * Get log tail for debugging.
   */
  getLogTail() {
    return this._logTail;
  }

  /**
   * Get provider display name.
   */
  getProviderDisplayName() {
    return `Kokoro (${this._speaker})`;
  }
}

module.exports = {
  TtsService,
};
