const { spawn } = require('child_process');
const path = require('path');

const MAX_SHELL_OUTPUT = 50000;
const MAX_BACKGROUND_PROCESSES = 5;
const DEFAULT_TIMEOUT_MS = 30000;

const DANGEROUS_COMMANDS = [
  /^\brm\s+(-rf?|--recursive)\b/i,
  /^\bdel\s+\/[fqs]\b/i,
  /^\bformat\b/i,
  /^\bshutdown\b/i,
  /^\bsudo\s+(rm|dd|mkfs|fdisk|parted)\b/i,
  /^\bchmod\s+-R\s+777\b/i,
  /^\bchown\s+-R\b/i,
  /^\bkill\s+-9\b/i,
  /^\bnet\s+user\b/i,
  /\b;.*\b(rm|del|format|shutdown)\b/i,
  /\|\|.*\b(rm|del|format|shutdown)\b/i,
  /&&.*\b(rm|del|format|shutdown)\b/i,
  /\$\(\s*(rm|del|format|shutdown)\b/i,
  /`.*\b(rm|del|format|shutdown)\b/i,
];

function isDangerous(command) {
  return DANGEROUS_COMMANDS.some((pattern) => pattern.test(command));
}

let runningProcesses = new Map();
let processCounter = 0;

function getNextProcessId() {
  return `shell-${++processCounter}`;
}

function runShellCommand(command, options = {}) {
  const { cwd, timeout = DEFAULT_TIMEOUT_MS, env = {} } = options;
  const processId = getNextProcessId();

  if (runningProcesses.size >= MAX_BACKGROUND_PROCESSES) {
    return { ok: false, error: `Max ${MAX_BACKGROUND_PROCESSES} processi shell simultanei.` };
  }

  const isWin = process.platform === 'win32';
  const shell = isWin ? 'cmd.exe' : '/bin/bash';
  const args = isWin ? ['/c', command] : ['-c', command];

  return new Promise((resolve) => {
    const proc = spawn(shell, args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...env },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let completed = false;

    const timeoutId = setTimeout(() => {
      if (!completed) {
        try { proc.kill('SIGTERM'); } catch {}
        completed = true;
        runningProcesses.delete(processId);
        resolve({
          ok: false,
          error: `Timeout dopo ${timeout}ms`,
          stdout: stdout.slice(-MAX_SHELL_OUTPUT),
          stderr: stderr.slice(-MAX_SHELL_OUTPUT),
          processId,
          timedOut: true,
        });
      }
    }, timeout);

    proc.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
      if (stdout.length > MAX_SHELL_OUTPUT) {
        stdout = stdout.slice(-MAX_SHELL_OUTPUT);
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > MAX_SHELL_OUTPUT) {
        stderr = stderr.slice(-MAX_SHELL_OUTPUT);
      }
    });

    proc.on('error', (error) => {
      if (!completed) {
        clearTimeout(timeoutId);
        completed = true;
        runningProcesses.delete(processId);
        resolve({ ok: false, error: error.message, processId });
      }
    });

    proc.on('close', (code) => {
      if (!completed) {
        clearTimeout(timeoutId);
        completed = true;
        runningProcesses.delete(processId);
        resolve({
          ok: code === 0,
          exitCode: code,
          stdout: stdout.slice(-MAX_SHELL_OUTPUT),
          stderr: stderr.slice(-MAX_SHELL_OUTPUT),
          processId,
          command,
        });
      }
    });

    runningProcesses.set(processId, { proc, command, cwd, startTime: Date.now() });
  });
}

function stopShellProcess(processId) {
  const entry = runningProcesses.get(processId);
  if (!entry) return { ok: false, error: 'Processo non trovato.' };
  try { entry.proc.kill('SIGTERM'); } catch {}
  runningProcesses.delete(processId);
  return { ok: true, message: `Processo ${processId} terminato.` };
}

function listShellProcesses() {
  const list = [];
  for (const [id, entry] of runningProcesses.entries()) {
    list.push({
      processId: id,
      command: entry.command,
      cwd: entry.cwd,
      runningFor: Date.now() - entry.startTime,
    });
  }
  return list;
}

function stopAllShellProcesses() {
  for (const [id] of runningProcesses.entries()) {
    stopShellProcess(id);
  }
  runningProcesses.clear();
}

module.exports = {
  runShellCommand,
  stopShellProcess,
  listShellProcesses,
  stopAllShellProcesses,
  isDangerous,
  MAX_SHELL_OUTPUT,
  MAX_BACKGROUND_PROCESSES,
  DEFAULT_TIMEOUT_MS,
};
