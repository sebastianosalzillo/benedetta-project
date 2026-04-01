const { spawn } = require('child_process');
const path = require('path');
const {
  QWEN_CLI_JS_PATH,
  ACP_PROTOCOL_VERSION,
  ACP_CLIENT_NAME,
  ACP_CLIENT_VERSION,
  MAX_STDERR_TAIL_LENGTH,
  MAX_PROMPT_LINE_LENGTH,
} = require('./constants');
const fs = require('fs');

/**
 * Strip ANSI escape codes from text.
 */
function stripAnsi(text) {
  return String(text || '').replace(
    /\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    '',
  );
}

/**
 * Normalize a line of text to a max length.
 */
function normalizeLine(text, maxLength) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Extract speech preview from raw ACP output by stripping tokens and reasoning tags.
 */
function extractSpeechPreview(raw, reasoningTagNames) {
  let preview = String(raw || '');
  preview = preview.replace(/<\|ACT[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|CANVAS[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|BROWSER[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|COMPUTER[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|WORKSPACE[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|DELAY:\s*\d+(?:\.\d+)?\|>/gi, '');

  for (const tagName of reasoningTagNames) {
    const regex = new RegExp(`<${tagName}>[\\s\\S]*?</${tagName}>`, 'gi');
    preview = preview.replace(regex, '');
  }

  return preview
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Convert ACP content block to text string.
 */
function contentBlockToText(block) {
  if (!block) return '';
  if (typeof block === 'string') return block;
  if (typeof block.text === 'string') return block.text;
  if (Array.isArray(block.content)) {
    return block.content.map((item) => contentBlockToText(item)).filter(Boolean).join('');
  }
  if (typeof block.content === 'string') return block.content;
  if (block.content && typeof block.content.text === 'string') return block.content.text;
  return '';
}

/**
 * Qwen ACP Runtime Manager.
 * Manages the qwen --acp --channel ACP subprocess with proper JSON-RPC communication,
 * memory leak prevention, and graceful shutdown.
 */
class QwenAcpRuntime {
  constructor(options = {}) {
    this._proc = null;
    this._initialized = false;
    this._stdoutBuffer = '';
    this._stderrTail = '';
    this._pending = new Map();
    this._nextRequestId = 1;
    this._loadedSessionId = '';
    this._currentTurn = null;
    this._readyPromise = null;
    this._onStatusChange = options.onStatusChange;
    this._onStderrAppend = options.onStderrAppend;
    this._reasoningTagNames = options.reasoningTagNames || ['think', 'thought', 'reasoning', 'analysis', 'internal', 'plan'];
    this._onStreamChunk = options.onStreamChunk;
    this._cwd = options.cwd || path.join(__dirname, '..');
  }

  get proc() { return this._proc; }
  get initialized() { return this._initialized; }
  get loadedSessionId() { return this._loadedSessionId; }
  get currentTurn() { return this._currentTurn; }
  get pendingSize() { return this._pending.size; }

  _appendStderr(chunk) {
    const line = stripAnsi(String(chunk || ''));
    this._stderrTail = `${this._stderrTail}\n${line}`.trim().slice(-MAX_STDERR_TAIL_LENGTH);
    this._onStderrAppend?.(line);
  }

  _handleMessage(message) {
    if (!message || typeof message !== 'object') return;

    // Response to a request (has id)
    if (Object.prototype.hasOwnProperty.call(message, 'id')) {
      const pending = this._pending.get(message.id);
      if (!pending) return;
      this._pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(normalizeLine(message.error.message || JSON.stringify(message.error), MAX_PROMPT_LINE_LENGTH)));
        return;
      }
      pending.resolve(message.result);
      return;
    }

    // Session update notification
    if (message.method !== 'session/update') return;

    const sessionId = String(message.params?.sessionId || '').trim();
    const update = message.params?.update || {};
    const turn = this._currentTurn;
    if (!turn || !sessionId || turn.sessionId !== sessionId) return;

    if (update.sessionUpdate === 'agent_message_chunk') {
      const chunkText = contentBlockToText(update.content);
      if (!chunkText) return;
      turn.buffer += chunkText;
      if (!turn.streamPreview) return;
      const nextPreview = extractSpeechPreview(turn.buffer, this._reasoningTagNames);
      if (nextPreview.length > turn.preview.length && nextPreview.startsWith(turn.preview)) {
        const delta = nextPreview.slice(turn.preview.length);
        turn.preview = nextPreview;
        this._onStreamChunk?.(delta);
      } else if (!turn.preview && nextPreview) {
        turn.preview = nextPreview;
        this._onStreamChunk?.(nextPreview);
      }
      return;
    }

    if (update.sessionUpdate === 'agent_thought_chunk') {
      const chunkText = contentBlockToText(update.content);
      if (chunkText) turn.reasoning += chunkText;
      return;
    }

    if (update.sessionUpdate === 'session_info_update') {
      const nextSessionId = String(update.sessionId || update.id || sessionId || '').trim();
      if (nextSessionId && nextSessionId !== turn.sessionId) {
        turn.sessionId = nextSessionId;
      }
    }
  }

  _sendRaw(payload) {
    if (!this._proc || this._proc.killed) {
      throw new Error('Qwen ACP non disponibile.');
    }
    this._proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  sendNotification(method, params = null) {
    this._sendRaw({
      jsonrpc: '2.0',
      method,
      ...(params == null ? {} : { params }),
    });
  }

  sendRequest(method, params = null) {
    if (!this._proc || this._proc.killed) {
      return Promise.reject(new Error('Qwen ACP non disponibile.'));
    }

    const id = (this._nextRequestId += 1);
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params == null ? {} : { params }),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Qwen ACP request timeout: ${method}`));
      }, 60000);

      this._pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
        method,
      });
      try {
        this._sendRaw(payload);
      } catch (error) {
        this._pending.delete(id);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Ensure the Qwen ACP subprocess is running and initialized.
   * Idempotent: returns immediately if already running.
   */
  async ensure() {
    if (this._proc && !this._proc.killed && this._initialized) {
      return this;
    }

    if (this._readyPromise) {
      return this._readyPromise;
    }

    this._readyPromise = this._start();
    try {
      return await this._readyPromise;
    } finally {
      this._readyPromise = null;
    }
  }

  async _start() {
    this._stop(true);

    const useNodeLauncher = fs.existsSync(QWEN_CLI_JS_PATH);
    const command = useNodeLauncher ? 'node' : 'qwen';
    const args = useNodeLauncher
      ? [QWEN_CLI_JS_PATH, '--acp', '--channel', 'ACP']
      : ['--acp', '--channel', 'ACP'];

    const proc = spawn(command, args, {
      cwd: this._cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });

    this._proc = proc;
    this._initialized = false;
    this._stdoutBuffer = '';
    this._stderrTail = '';
    this._onStatusChange?.('starting');

    proc.stdout.on('data', (chunk) => {
      this._stdoutBuffer += String(chunk || '');
      let newlineIndex = this._stdoutBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const rawLine = this._stdoutBuffer.slice(0, newlineIndex).trim();
        this._stdoutBuffer = this._stdoutBuffer.slice(newlineIndex + 1);
        if (rawLine) {
          try {
            this._handleMessage(JSON.parse(rawLine));
          } catch (error) {
            this._appendStderr(`ACP parse error: ${error.message}. Line: ${rawLine.slice(0, 500)}`);
          }
        }
        newlineIndex = this._stdoutBuffer.indexOf('\n');
      }
    });

    proc.stderr.on('data', (chunk) => this._appendStderr(chunk));

    proc.on('error', (error) => {
      this._appendStderr(error.message);
      this._onStatusChange?.('error');
    });

    proc.on('close', (code) => {
      if (this._proc !== proc) return;

      const isNormalExit = code === 0 || code === 143 || code === null;
      if (isNormalExit) {
        for (const pending of this._pending.values()) {
          pending.resolve({ cancelled: true, reason: 'process_closed' });
        }
      } else {
        const exitError = new Error(normalizeLine(this._stderrTail || `Qwen ACP exited with code ${code}`, MAX_PROMPT_LINE_LENGTH));
        for (const pending of this._pending.values()) {
          pending.reject(exitError);
        }
      }
      this._onStatusChange?.('stopped');
      this._clearState();
    });

    // Initialize protocol
    const initResult = await this.sendRequest('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientInfo: {
        name: ACP_CLIENT_NAME,
        version: ACP_CLIENT_VERSION,
      },
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
    });

    this._initialized = true;
    this._onStatusChange?.('ready');

    if (!initResult?.agentInfo?.name) {
      this._appendStderr('Qwen ACP initialize completato senza agentInfo esplicito.');
    }

    return this;
  }

  /**
   * Create or reuse an ACP session.
   */
  async ensureSession() {
    await this.ensure();

    if (this._loadedSessionId && this._initialized) {
      return this._loadedSessionId;
    }

    const result = await this.sendRequest('session/new', {
      cwd: this._cwd,
      mcpServers: [],
    });
    const sessionId = String(result?.sessionId || '').trim();
    if (!sessionId) {
      throw new Error('Qwen ACP non ha restituito un sessionId valido.');
    }
    this._loadedSessionId = sessionId;
    return sessionId;
  }

  /**
   * Run a single ACP turn with proper turn state management.
   */
  async runTurn(requestId, prompt, options = {}) {
    await this.ensure();

    const sessionId = options.sessionId || await this.ensureSession();
    const controller = new AbortController();

    const turnState = {
      requestId,
      sessionId,
      isNewSession: Boolean(options.isNewSession),
      streamPreview: Boolean(options.streamPreview),
      preview: '',
      buffer: '',
      reasoning: '',
    };
    this._currentTurn = turnState;

    // Set up cancel notification
    const cancelFn = async () => {
      if (sessionId) {
        this.sendNotification('session/cancel', { sessionId });
      }
    };

    try {
      const promptResponse = await this.sendRequest('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: prompt }],
      });

      if (this._currentTurn?.requestId === requestId) {
        this._currentTurn = null;
      }

      const buffer = String(turnState.buffer || '').trim();
      return {
        buffer,
        reasoning: turnState.reasoning,
        sessionId,
        stopReason: promptResponse?.stopReason || 'end_turn',
        cancelFn,
      };
    } catch (error) {
      if (this._currentTurn?.requestId === requestId) {
        this._currentTurn = null;
      }
      throw error;
    }
  }

  /**
   * Stop the ACP runtime.
   */
  _stop(silent = false) {
    if (this._proc) {
      try {
        this._proc.kill();
      } catch {
        // ignore cleanup errors
      }
    }

    if (!silent) {
      const stopError = new Error('Qwen ACP arrestato.');
      for (const pending of this._pending.values()) {
        pending.reject(stopError);
      }
    } else {
      for (const pending of this._pending.values()) {
        pending.resolve({ cancelled: true });
      }
    }

    this._clearState();
  }

  stop(silent = false) {
    this._stop(silent);
  }

  _clearState() {
    this._proc = null;
    this._initialized = false;
    this._stdoutBuffer = '';
    this._pending.clear();
    this._nextRequestId = 1;
    this._loadedSessionId = '';
    this._currentTurn = null;
  }

  /**
   * Get stderr tail for debugging.
   */
  getStderrTail() {
    return this._stderrTail;
  }
}

module.exports = {
  QwenAcpRuntime,
  extractSpeechPreview,
  stripAnsi,
  normalizeLine,
  contentBlockToText,
};
