/**
 * @fileoverview Git operations tool.
 * Provides git status, diff, log, add, commit, branch, checkout, stash, pull, push.
 */

const { spawn } = require('child_process');
const path = require('path');

/**
 * Git command result.
 * @typedef {Object} GitResult
 * @property {boolean} ok - Whether the command succeeded
 * @property {number} [exitCode] - Process exit code
 * @property {string} [stdout] - Standard output
 * @property {string} [stderr] - Standard error
 * @property {string} [error] - Error message if failed
 */

/**
 * Run a git command with the given arguments.
 *
 * @param {string[]} args - Git command arguments (e.g., ['status', '--short'])
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Command result
 */
function runGitCommand(args, cwd = '.') {
  return new Promise((resolve) => {
    const proc = spawn('git', args, {
      cwd: path.resolve(cwd),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    proc.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });

    proc.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });

    proc.on('close', (code) => {
      resolve({
        ok: code === 0,
        exitCode: code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

/**
 * Get git status in short format.
 *
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult & {branch?: string, files?: Array<{status: string, path: string}>}>} Status result
 * @example
 * const status = await gitStatus('/path/to/repo')
 * console.log(status.files)
 */
async function gitStatus(cwd = '.') {
  const result = await runGitCommand(['status', '--short', '--branch'], cwd);
  if (!result.ok) return result;

  const lines = result.stdout.split('\n').filter(Boolean);
  const branchLine = lines.shift() || '';
  const files = lines.map((line) => ({
    status: line.slice(0, 2).trim(),
    path: line.slice(3).trim(),
  }));

  return { ok: true, branch: branchLine, files };
}

/**
 * Get git diff or diff stat.
 *
 * @param {string} [cwd='.'] - Working directory
 * @param {boolean} [staged=false] - Whether to show staged changes
 * @returns {Promise<GitResult>} Diff result
 * @example
 * await gitDiff('/path/to/repo', true) // staged diff
 */
async function gitDiff(cwd = '.', staged = false) {
  const args = staged ? ['diff', '--staged'] : ['diff', '--stat'];
  return runGitCommand(args, cwd);
}

/**
 * Get git log.
 *
 * @param {string} [cwd='.'] - Working directory
 * @param {number} [limit=20] - Number of commits to return
 * @returns {Promise<GitResult>} Log result
 * @example
 * await gitLog('/path/to/repo', 5)
 */
async function gitLog(cwd = '.', limit = 20) {
  const format = '%h|%an|%ae|%ai|%s';
  return runGitCommand(['log', `-${limit}`, `--format=${format}`], cwd);
}

/**
 * Stage files for commit.
 *
 * @param {string|string[]} files - File path(s) to stage
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Stage result
 * @example
 * await gitAdd(['src/main.js', 'src/utils.js'])
 */
async function gitAdd(files, cwd = '.') {
  const args = ['add', ...Array.isArray(files) ? files : [files]];
  return runGitCommand(args, cwd);
}

/**
 * Create a commit with a message.
 *
 * @param {string} message - Commit message
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Commit result
 * @example
 * await gitCommit('feat: add user authentication')
 */
async function gitCommit(message, cwd = '.') {
  return runGitCommand(['commit', '-m', message], cwd);
}

/**
 * List all branches.
 *
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Branch list result
 */
async function gitBranch(cwd = '.') {
  return runGitCommand(['branch', '-a'], cwd);
}

/**
 * Switch to a branch.
 *
 * @param {string} branch - Branch name
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Checkout result
 * @example
 * await gitCheckout('feature/new-branch')
 */
async function gitCheckout(branch, cwd = '.') {
  return runGitCommand(['checkout', branch], cwd);
}

/**
 * Create and switch to a new branch.
 *
 * @param {string} branch - New branch name
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Create branch result
 */
async function gitCreateBranch(branch, cwd = '.') {
  return runGitCommand(['checkout', '-b', branch], cwd);
}

/**
 * Stash current changes.
 *
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Stash result
 */
async function gitStash(cwd = '.') {
  return runGitCommand(['stash'], cwd);
}

/**
 * Apply and remove the most recent stash.
 *
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Stash pop result
 */
async function gitStashPop(cwd = '.') {
  return runGitCommand(['stash', 'pop'], cwd);
}

/**
 * Pull changes from remote.
 *
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Pull result
 */
async function gitPull(cwd = '.') {
  return runGitCommand(['pull'], cwd);
}

/**
 * Push changes to remote.
 *
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Push result
 */
async function gitPush(cwd = '.') {
  return runGitCommand(['push'], cwd);
}

/**
 * List remote repositories.
 *
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Remote list result
 */
async function gitRemote(cwd = '.') {
  return runGitCommand(['remote', '-v'], cwd);
}

/**
 * Git action parameters.
 * @typedef {Object} GitActionParams
 * @property {string} [branch] - Branch name (for checkout/create_branch)
 * @property {string[]} [files] - File paths (for add)
 * @property {string} [message] - Commit message (for commit)
 * @property {boolean} [staged] - Whether to show staged changes (for diff)
 * @property {number} [limit=20] - Number of log entries (for log)
 */

/**
 * Execute a git action by name.
 *
 * Dispatches to the appropriate git function based on action name.
 *
 * @param {string} action - Action name (status, diff, log, add, commit, branch, checkout, create_branch, stash, stash_pop, pull, push, remote)
 * @param {GitActionParams} [params] - Action-specific parameters
 * @param {string} [cwd='.'] - Working directory
 * @returns {Promise<GitResult>} Action result
 * @example
 * await gitHandleAction('status', {}, '/path/to/repo')
 * await gitHandleAction('add', { files: ['src/main.js'] })
 * await gitHandleAction('commit', { message: 'fix: resolve bug' })
 */
async function gitHandleAction(action, params = {}, cwd = '.') {
  switch (action) {
    case 'status': return gitStatus(cwd);
    case 'diff': return gitDiff(cwd, params.staged);
    case 'log': return gitLog(cwd, params.limit || 20);
    case 'add': return gitAdd(params.files, cwd);
    case 'commit': return gitCommit(params.message, cwd);
    case 'branch': return gitBranch(cwd);
    case 'checkout': return gitCheckout(params.branch, cwd);
    case 'create_branch': return gitCreateBranch(params.branch, cwd);
    case 'stash': return gitStash(cwd);
    case 'stash_pop': return gitStashPop(cwd);
    case 'pull': return gitPull(cwd);
    case 'push': return gitPush(cwd);
    case 'remote': return gitRemote(cwd);
    default: return { ok: false, error: `Azione git sconosciuta: ${action}` };
  }
}

module.exports = {
  gitHandleAction,
  gitStatus,
  gitDiff,
  gitLog,
  gitAdd,
  gitCommit,
  gitBranch,
  gitCheckout,
  gitCreateBranch,
  gitStash,
  gitStashPop,
  gitPull,
  gitPush,
  gitRemote,
};
