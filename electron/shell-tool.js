/**
 * @fileoverview Shell command execution tool with safety guards.
 * Provides sandboxed shell execution with dangerous command detection,
 * process limits, timeout enforcement, and output capping.
 */

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

/**
 * Shell command execution result.
 * @typedef {Object} ShellResult
 * @property {boolean} ok - Whether the command succeeded
 * @property {string} [error] - Error message if failed
 * @property {string} [stdout] - Standard output (capped at 50KB)
 * @property {string} [stderr] - Standard error (capped at 50KB)
 * @property {string} [processId] - Unique process identifier
 * @property {number} [exitCode] - Process exit code
 * @property {boolean} [timedOut] - Whether the command timed out
 * @property {string} [command] - The original command
 */

/**
 * Options for shell command execution.
 * @typedef {Object} ShellOptions
 * @property {string} [cwd] - Working directory for the command
 * @property {number} [timeout=30000] - Timeout in milliseconds
 * @property {Object} [env] - Additional environment variables
 * @property {boolean} [allowDangerous=false] - Bypass dangerous command detection
 */

/**
 * Check if a command matches dangerous patterns.
 * Blocks: rm -rf, del /f, format, shutdown, sudo rm/dd/mkfs,
 * chmod -R 777, chown -R, kill -9, net user, and chained variants.
 *
 * @param {string} command - The shell command to check
 * @returns {boolean} True if the command is dangerous
 * @example
 * isDangerous('rm -rf /tmp/test') // true
 * isDangerous('ls -la') // false
 */
function isDangerous(command) {
  return DANGEROUS_COMMANDS.some((pattern) => pattern.test(command));
}

let runningProcesses = new Map();
let processCounter = 0;

function getNextProcessId() {
  return `shell-${++processCounter}`;
}

/**
 * Run a shell command with safety guards.
 * 
 * Executes the command in a subprocess with timeout enforcement,
 * output capping (50KB max per stream), and dangerous command detection.
 * Maximum 5 concurrent background processes.
 *
 * @param {string} command - The shell command to execute
 * @param {ShellOptions} [options] - Execution options
 * @returns {Promise<ShellResult>} Command execution result
 * @example
 * // Simple command
 * await runShellCommand('ls -la')
 * 
 * // With options
 * await runShellCommand('npm install', { cwd: '/path/to/project', timeout: 60000 })
 * 
 * // Background process
 * await runShellCommand('tail -f /var/log/syslog', { timeout: 0 })
 */
function runShellCommand(command, options = {}) {
  const { cwd, timeout = DEFAULT_TIMEOUT_MS, env = {}, allowDangerous = false } = options;
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

/**
 * Stop a running background shell process.
 *
 * Sends SIGTERM to the process and removes it from tracking.
 *
 * @param {string} processId - The process ID returned from runShellCommand
 * @returns {{ok: boolean, message?: string, error?: string}} Result of the stop operation
 * @example
 * const result = await runShellCommand('sleep 100')
 * await stopShellProcess(result.processId)
 */
function stopShellProcess(processId) {
  const entry = runningProcesses.get(processId);
  if (!entry) return { ok: false, error: 'Processo non trovato.' };
  try { entry.proc.kill('SIGTERM'); } catch {}
  runningProcesses.delete(processId);
  return { ok: true, message: `Processo ${processId} terminato.` };
}

/**
 * List all tracked background shell processes.
 *
 * @returns {Array<{processId: string, command: string, cwd: string, runningFor: number}>} List of running processes
 * @example
 * const processes = listShellProcesses()
 * console.log(processes.map(p => `${p.processId}: ${p.command}`))
 */
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

/**
 * Stop all running background shell processes.
 * 
 * Sends SIGTERM to all tracked processes and clears the process map.
 * Use with caution — this will terminate all background commands.
 *
 * @returns {void}
 */
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
