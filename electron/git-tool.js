const { spawn } = require('child_process');
const path = require('path');

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

async function gitDiff(cwd = '.', staged = false) {
  const args = staged ? ['diff', '--staged'] : ['diff', '--stat'];
  return runGitCommand(args, cwd);
}

async function gitLog(cwd = '.', limit = 20) {
  const format = '%h|%an|%ae|%ai|%s';
  return runGitCommand(['log', `-${limit}`, `--format=${format}`], cwd);
}

async function gitAdd(files, cwd = '.') {
  const args = ['add', ...Array.isArray(files) ? files : [files]];
  return runGitCommand(args, cwd);
}

async function gitCommit(message, cwd = '.') {
  return runGitCommand(['commit', '-m', message], cwd);
}

async function gitBranch(cwd = '.') {
  return runGitCommand(['branch', '-a'], cwd);
}

async function gitCheckout(branch, cwd = '.') {
  return runGitCommand(['checkout', branch], cwd);
}

async function gitCreateBranch(branch, cwd = '.') {
  return runGitCommand(['checkout', '-b', branch], cwd);
}

async function gitStash(cwd = '.') {
  return runGitCommand(['stash'], cwd);
}

async function gitStashPop(cwd = '.') {
  return runGitCommand(['stash', 'pop'], cwd);
}

async function gitPull(cwd = '.') {
  return runGitCommand(['pull'], cwd);
}

async function gitPush(cwd = '.') {
  return runGitCommand(['push'], cwd);
}

async function gitRemote(cwd = '.') {
  return runGitCommand(['remote', '-v'], cwd);
}

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
