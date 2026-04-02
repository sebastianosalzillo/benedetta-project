const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  QWEN_CLI_JS_PATH,
  BRAIN_TEST_TIMEOUT_MS,
} = require('./electron/constants');

const PROJECT_ROOT = __dirname;

function resolveLauncher() {
  if (fs.existsSync(QWEN_CLI_JS_PATH)) {
    return {
      command: 'node',
      args: [QWEN_CLI_JS_PATH, '--acp', '--channel', 'ACP'],
      label: `node ${QWEN_CLI_JS_PATH}`,
    };
  }

  return {
    command: 'qwen',
    args: ['--acp', '--channel', 'ACP'],
    label: 'qwen --acp --channel ACP',
  };
}

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

async function runSmokeTest() {
  const launcher = resolveLauncher();
  console.log(`ACP smoke test using: ${launcher.label}`);

  return new Promise((resolve, reject) => {
    const proc = spawn(launcher.command, launcher.args, {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let sessionId = '';
    let promptCompleted = false;
    let promptText = '';
    let settled = false;

    const finish = (error = null, result = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        proc.kill();
      } catch {
        // ignore cleanup errors
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };

    const send = (message) => {
      proc.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const handleMessage = (message) => {
      if (!message || typeof message !== 'object') return;

      if (message.method === 'session/update') {
        const update = message.params?.update || {};
        if (update.sessionUpdate === 'agent_message_chunk') {
          promptText += contentBlockToText(update.content);
        }
        if (update.sessionUpdate === 'session_info_update') {
          const nextSessionId = String(update.sessionId || update.id || message.params?.sessionId || '').trim();
          if (nextSessionId) sessionId = nextSessionId;
        }
        return;
      }

      if (message.id === 1) {
        if (message.error) {
          finish(new Error(`initialize failed: ${JSON.stringify(message.error)}`));
          return;
        }
        send({
          jsonrpc: '2.0',
          id: 2,
          method: 'session/new',
          params: {
            cwd: PROJECT_ROOT,
            mcpServers: [],
          },
        });
        return;
      }

      if (message.id === 2) {
        if (message.error) {
          finish(new Error(`session/new failed: ${JSON.stringify(message.error)}`));
          return;
        }
        sessionId = String(message.result?.sessionId || '').trim();
        if (!sessionId) {
          finish(new Error('session/new returned no sessionId'));
          return;
        }
        send({
          jsonrpc: '2.0',
          id: 3,
          method: 'session/prompt',
          params: {
            sessionId,
            prompt: [
              {
                type: 'text',
                text: 'Rispondi solo con OK.',
              },
            ],
          },
        });
        return;
      }

      if (message.id === 3) {
        if (message.error) {
          finish(new Error(`session/prompt failed: ${JSON.stringify(message.error)}`));
          return;
        }
        promptCompleted = true;
        const normalized = String(promptText || '').replace(/\s+/g, ' ').trim();
        if (!normalized) {
          finish(new Error('session/prompt completed without assistant text'));
          return;
        }
        finish(null, {
          sessionId,
          stopReason: message.result?.stopReason || 'unknown',
          preview: normalized.slice(0, 200),
        });
      }
    };

    proc.stdout.on('data', (chunk) => {
      stdoutBuffer += String(chunk || '');
      let newlineIndex = stdoutBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const rawLine = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (rawLine) {
          try {
            handleMessage(JSON.parse(rawLine));
          } catch (error) {
            finish(new Error(`ACP parse error: ${error.message}. Line: ${rawLine.slice(0, 300)}`));
            return;
          }
        }
        newlineIndex = stdoutBuffer.indexOf('\n');
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderrBuffer += String(chunk || '');
    });

    proc.on('error', (error) => {
      finish(new Error(`ACP process error: ${error.message}`));
    });

    proc.on('close', (code) => {
      if (!settled && !promptCompleted) {
        finish(new Error(`ACP exited before test completion (code=${code}). ${stderrBuffer.slice(-400)}`));
      }
    });

    const timeout = setTimeout(() => {
      finish(new Error(`ACP smoke test timeout after ${BRAIN_TEST_TIMEOUT_MS}ms. ${stderrBuffer.slice(-400)}`));
    }, BRAIN_TEST_TIMEOUT_MS);

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientInfo: { name: 'avatar-acp-smoke', version: '1.0.0' },
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
      },
    });
  });
}

(async () => {
  try {
    const result = await runSmokeTest();
    console.log('ACP smoke test passed.');
    console.log(`Session: ${result.sessionId}`);
    console.log(`Stop reason: ${result.stopReason}`);
    console.log(`Preview: ${result.preview}`);
    process.exit(0);
  } catch (error) {
    console.error('ACP smoke test failed.');
    console.error(error.message || String(error));
    process.exit(1);
  }
})();
