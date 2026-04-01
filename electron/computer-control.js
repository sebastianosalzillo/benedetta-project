const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  COMPUTER_ACTION_TIMEOUT_MS,
  COMPUTER_OCR_MAX_CHARS,
  PYWINAUTO_MCP_URL,
  PYWINAUTO_MCP_HOST,
  PYWINAUTO_MCP_PORT,
  PYWINAUTO_MCP_REPO_URL,
  PYWINAUTO_MCP_STARTUP_TIMEOUT_MS,
  OLLAMA_HOST,
  DEFAULT_OLLAMA_MODEL,
  PREFERRED_OLLAMA_MODELS,
  MAX_PYWINAUTO_LOG_TAIL,
  MAX_OCR_ERROR_LENGTH,
  MAX_STATUS_ERROR_LENGTH,
  MAX_BOT_RESULT_LENGTH,
  MAX_PROMPT_LINE_LENGTH,
  MAX_BOT_CONTROL_ID_LABEL,
  MAX_BOT_CLICK_FALLBACK_LABEL,
  MAX_BOT_AUTO_ID_LABEL,
  MAX_BOT_CLASS_NAME_LABEL,
} = require('./constants');

/**
 * Normalize a line of text to a max length.
 */
function normalizeLine(text, maxLength) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Normalize computer OCR text.
 */
function normalizeComputerOcrText(text, maxLength) {
  const normalized = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}\u2026`;
}

/**
 * Build a Base64-encoded PowerShell command for safe execution.
 */
function buildPowerShellEncodedCommand(script) {
  return Buffer.from(String(script || ''), 'utf16le').toString('base64');
}

/**
 * Decode PowerShell CLIXML error output.
 */
function decodePowerShellCliXml(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  if (!source.includes('#< CLIXML')) return source;

  const errorChunks = [...source.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)]
    .map((match) => String(match[1] || ''))
    .filter(Boolean);

  const raw = errorChunks.length ? errorChunks.join(' ') : source;
  return raw
    .replace(/_x000D__x000A_/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Run a PowerShell script and parse JSON output.
 * Uses Base64-encoded command to prevent injection.
 */
function runPowerShellJson(script, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-STA',
      '-EncodedCommand',
      buildPowerShellEncodedCommand(script),
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || COMPUTER_ACTION_TIMEOUT_MS));
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore timeout kill errors */ }
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    proc.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
    proc.on('error', (error) => { clearTimeout(timer); reject(error); });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      const output = String(stdout || '').trim();
      if (code !== 0) {
        reject(new Error(decodePowerShellCliXml(String(stderr || output || `PowerShell exited with code ${code}`))));
        return;
      }
      if (!output) { resolve({}); return; }
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error(`Invalid PowerShell JSON output: ${output}`));
      }
    });
  });
}

/**
 * Build the PowerShell Preamble with Win32 interop definitions.
 */
function buildComputerPowerShellPrelude() {
  return `
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public struct POINT {
  public int X;
  public int Y;
}

public struct RECT {
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}

public class NyxComputerWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  [DllImport("user32.dll")]
  public static extern bool GetCursorPos(out POINT lpPoint);

  [DllImport("user32.dll")]
  public static extern int GetSystemMetrics(int nIndex);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool BringWindowToTop(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
"@
`;
}

/**
 * Build PowerShell script to enumerate visible windows.
 */
function buildComputerWindowsStateScript(limit) {
  const safeLimit = Math.max(1, Math.min(20, limit || 10));
  return `
${buildComputerPowerShellPrelude()}
$foreground = [NyxComputerWin32]::GetForegroundWindow()
$foregroundTitle = ''
$foregroundProcess = ''
$foregroundBounds = $null
$windows = New-Object System.Collections.Generic.List[object]
[NyxComputerWin32]::EnumWindows({
  param([IntPtr] $hwnd, [IntPtr] $lParam)
  if (-not [NyxComputerWin32]::IsWindowVisible($hwnd)) { return $true }
  $builder = New-Object System.Text.StringBuilder 512
  [void][NyxComputerWin32]::GetWindowText($hwnd, $builder, $builder.Capacity)
  $title = $builder.ToString().Trim()
  if (-not $title) { return $true }
  [uint32] $procId = 0
  [void][NyxComputerWin32]::GetWindowThreadProcessId($hwnd, [ref] $procId)
  $processName = ''
  try {
    $processName = (Get-Process -Id $procId -ErrorAction Stop).ProcessName
  } catch {
    $processName = ''
  }
  if ($hwnd -eq $foreground) {
    $script:foregroundTitle = $title
    $script:foregroundProcess = $processName
    $rect = New-Object RECT
    if ([NyxComputerWin32]::GetWindowRect($hwnd, [ref] $rect)) {
      $width = [Math]::Max(0, $rect.Right - $rect.Left)
      $height = [Math]::Max(0, $rect.Bottom - $rect.Top)
      if ($width -gt 0 -and $height -gt 0) {
        $script:foregroundBounds = [pscustomobject]@{
          x = $rect.Left
          y = $rect.Top
          width = $width
          height = $height
        }
      }
    }
  }
  $windows.Add([pscustomobject]@{
    title = $title
    process = $processName
    pid = [int] $procId
  })
  return $true
}, [IntPtr]::Zero) | Out-Null
$point = New-Object POINT
[void][NyxComputerWin32]::GetCursorPos([ref] $point)
[pscustomobject]@{
  ok = $true
  foregroundTitle = $foregroundTitle
  foregroundProcess = $foregroundProcess
  foregroundBounds = $foregroundBounds
  cursorX = $point.X
  cursorY = $point.Y
  windows = @($windows | Select-Object -First ${safeLimit})
} | ConvertTo-Json -Depth 5 -Compress
`;
}

/**
 * Escape special characters for SendKeys.
 */
function escapeSendKeysLiteral(text) {
  const replacements = {
    '+': '{+}', '^': '{^}', '%': '{%}', '~': '{~}',
    '(': '{(}', ')': '{)}', '[': '{[}', ']': '{]}',
    '{': '{{}', '}': '{}}',
  };
  return String(text || '')
    .split('')
    .map((char) => replacements[char] || char)
    .join('');
}

/**
 * Get named key token for SendKeys.
 */
function buildSendKeysKeyToken(key) {
  const normalizedKey = String(key || '').trim().toLowerCase();
  if (!normalizedKey) return '';

  const namedKeys = {
    enter: '{ENTER}', return: '{ENTER}', invio: '{ENTER}',
    tab: '{TAB}', esc: '{ESC}', escape: '{ESC}',
    delete: '{DEL}', del: '{DEL}', backspace: '{BACKSPACE}',
    space: ' ', up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
    home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
  };

  return namedKeys[normalizedKey]
    || (/^f\d{1,2}$/i.test(key) ? `{${key.toUpperCase()}}` : escapeSendKeysLiteral(key));
}

/**
 * Build SendKeys combo with modifiers.
 */
function buildSendKeysCombo(key, modifiers) {
  const modMap = { ctrl: '^', control: '^', shift: '+', alt: '%' };
  const prefix = (Array.isArray(modifiers) ? modifiers : [])
    .map((item) => modMap[String(item || '').trim().toLowerCase()] || '')
    .join('');
  const keyToken = buildSendKeysKeyToken(key);
  return keyToken ? `${prefix}${keyToken}` : '';
}

/**
 * Convert hotkey combo to SendKeys format.
 */
function convertHotkeyComboToSendKeys(combo) {
  const parts = String(combo || '').split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return '';

  const key = parts.pop();
  const modMap = { ctrl: '^', control: '^', shift: '+', alt: '%' };
  const prefix = parts.map((p) => modMap[p.toLowerCase()] || '').join('');
  const keyToken = buildSendKeysKeyToken(key);
  return `${prefix}${keyToken}`;
}

/**
 * Normalize modifiers array.
 */
function normalizeComputerModifiers(modifiers) {
  return (Array.isArray(modifiers) ? modifiers : [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Build screenshot region script for PowerShell.
 */
function buildComputerScreenshotRegionScript(region) {
  const normalizedRegion = String(region || '').trim();
  if (!normalizedRegion) return '[System.Windows.Forms.SystemInformation]::VirtualScreen';

  const parts = normalizedRegion.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) {
    throw new Error('screenshot region must be x,y,width,height.');
  }

  return `New-Object System.Drawing.Rectangle(${Math.round(parts[0])}, ${Math.round(parts[1])}, ${Math.round(parts[2])}, ${Math.round(parts[3])})`;
}

/**
 * Probe Ollama health using native fetch instead of curl.exe.
 */
async function probeOllamaStatus(host, model) {
  const normalizedHost = String(host || '').trim().replace(/\/+$/, '') || OLLAMA_HOST;
  const normalizedModel = String(model || '').trim() || DEFAULT_OLLAMA_MODEL;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(`${normalizedHost}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return {
        checkedAt: new Date().toISOString(),
        reachable: false,
        modelAvailable: false,
        availableModels: [],
        error: normalizeLine(`Ollama responded with status ${response.status}`, MAX_STATUS_ERROR_LENGTH),
      };
    }

    const payload = await response.json();
    const models = Array.isArray(payload?.models)
      ? payload.models.map((item) => String(item?.name || '').trim()).filter(Boolean)
      : [];

    return {
      checkedAt: new Date().toISOString(),
      reachable: true,
      modelAvailable: models.includes(normalizedModel),
      availableModels: models,
      error: '',
    };
  } catch (error) {
    return {
      checkedAt: new Date().toISOString(),
      reachable: false,
      modelAvailable: false,
      availableModels: [],
      error: normalizeLine(error?.message || 'Host Ollama non raggiungibile.', MAX_STATUS_ERROR_LENGTH),
    };
  }
}

// ============================================================
// Pywinauto MCP Service
// ============================================================

let pywinautoMcpProcess = null;
let pywinautoMcpStartupPromise = null;
let pywinautoMcpLogTail = '';

function hasUvBinary() {
  try {
    const result = spawnSync('uv', ['--version'], { windowsHide: true, encoding: 'utf8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

function getPywinautoMcpRepoDir() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'pywinauto-mcp');
}

function appendPywinautoMcpLog(chunk, source) {
  const line = `[${source}] ${String(chunk || '').trim()}`;
  if (!line.trim()) return;
  pywinautoMcpLogTail = `${pywinautoMcpLogTail}\n${line}`.trim().slice(-MAX_PYWINAUTO_LOG_TAIL);
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    proc.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) { resolve({ stdout, stderr }); return; }
      reject(new Error(String(stderr || stdout || `${command} exited with code ${code}`).trim()));
    });
  });
}

function hasGitBinary() {
  try {
    const result = spawnSync('git', ['--version'], { windowsHide: true, encoding: 'utf8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

async function ensurePywinautoMcpRepo() {
  const { app } = require('electron');
  const repoDir = getPywinautoMcpRepoDir();
  const pyprojectPath = path.join(repoDir, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) return repoDir;

  if (!hasGitBinary()) {
    throw new Error('git non disponibile: impossibile installare pywinauto-mcp automaticamente.');
  }

  await fs.promises.mkdir(path.dirname(repoDir), { recursive: true });
  if (fs.existsSync(repoDir)) {
    await fs.promises.rm(repoDir, { recursive: true, force: true });
  }

  await runCommand('git', ['clone', '--depth', '1', PYWINAUTO_MCP_REPO_URL, repoDir], {
    cwd: app.getPath('userData'),
  });

  return repoDir;
}

async function pywinautoMcpHealth() {
  const response = await fetch(`${PYWINAUTO_MCP_URL}/api/v1/health`);
  if (!response.ok) throw new Error(`pywinauto-mcp health ${response.status}`);
  return response.json();
}

function stopPywinautoMcpService() {
  pywinautoMcpStartupPromise = null;
  if (!pywinautoMcpProcess) return;
  try { pywinautoMcpProcess.kill(); } catch { /* ignore */ }
  pywinautoMcpProcess = null;
}

async function ensurePywinautoMcpService() {
  if (pywinautoMcpStartupPromise) return pywinautoMcpStartupPromise;

  pywinautoMcpStartupPromise = (async () => {
    if (!hasUvBinary()) {
      throw new Error('uv non disponibile: impossibile avviare pywinauto-mcp.');
    }

    try { await pywinautoMcpHealth(); return; } catch { /* not healthy yet */ }

    const repoDir = await ensurePywinautoMcpRepo();
    stopPywinautoMcpService();

    pywinautoMcpProcess = spawn('uv', [
      'run', '--directory', repoDir,
      'uvicorn', 'pywinauto_mcp.server:app',
      '--host', PYWINAUTO_MCP_HOST,
      '--port', String(PYWINAUTO_MCP_PORT),
      '--log-level', 'warning',
    ], {
      cwd: repoDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    pywinautoMcpProcess.stdout.on('data', (chunk) => appendPywinautoMcpLog(chunk, 'stdout'));
    pywinautoMcpProcess.stderr.on('data', (chunk) => appendPywinautoMcpLog(chunk, 'stderr'));
    pywinautoMcpProcess.on('exit', (code, signal) => {
      appendPywinautoMcpLog(`process exited code=${code} signal=${signal}`, 'exit');
      pywinautoMcpProcess = null;
    });
    pywinautoMcpProcess.on('error', (error) => appendPywinautoMcpLog(error.message, 'spawn-error'));

    const startedAt = Date.now();
    while (Date.now() - startedAt < PYWINAUTO_MCP_STARTUP_TIMEOUT_MS) {
      if (!pywinautoMcpProcess) {
        throw new Error(`pywinauto-mcp exited before becoming ready.\n${pywinautoMcpLogTail}`);
      }
      try { await pywinautoMcpHealth(); return; } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 800));
    }

    throw new Error(`pywinauto-mcp startup timeout.\n${pywinautoMcpLogTail}`);
  })();

  try { await pywinautoMcpStartupPromise; } finally { pywinautoMcpStartupPromise = null; }
}

function unwrapPywinautoToolResult(payload = {}) {
  const structured = payload?.result?.structured_content;
  if (structured && typeof structured === 'object') return structured;

  const textBlock = Array.isArray(payload?.result?.content)
    ? payload.result.content.find((item) => item?.type === 'text' && item?.text)
    : null;

  if (textBlock?.text) {
    try { return JSON.parse(textBlock.text); } catch { return { text: String(textBlock.text) }; }
  }

  return payload?.result || payload;
}

async function callPywinautoTool(name, argumentsPayload = {}) {
  await ensurePywinautoMcpService();
  const response = await fetch(`${PYWINAUTO_MCP_URL}/api/v1/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, arguments: argumentsPayload }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.detail || payload?.message || `pywinauto-mcp tool error ${response.status}`);
  }

  return unwrapPywinautoToolResult(payload);
}

function flattenPywinautoElements(elements = [], collected = []) {
  for (const element of Array.isArray(elements) ? elements : []) {
    if (element && typeof element === 'object') {
      collected.push(element);
      if (Array.isArray(element.children) && element.children.length) {
        flattenPywinautoElements(element.children, collected);
      }
    }
  }
  return collected;
}

function normalizePywinautoInteractiveElements(elements = []) {
  return flattenPywinautoElements(elements, [])
    .filter((item) => item && item.control_id !== undefined && item.control_id !== null)
    .slice(0, 20)
    .map((item) => ({
      controlId: item.control_id,
      title: String(item.text || item.name || '').trim(),
      className: String(item.class_name || '').trim(),
      elementType: String(item.element_type || item.control_type || '').trim(),
      autoId: String(item.automation_id || '').trim(),
    }));
}

async function readPywinautoActiveWindowDetails(title = '') {
  const windowTitle = String(title || '').trim();
  if (!windowTitle) return { handle: null, interactiveElements: [] };

  try {
    const lookup = await callPywinautoTool('automation_windows', { operation: 'find', title: windowTitle });
    const candidates = Array.isArray(lookup?.windows) ? lookup.windows : [];
    const focused = candidates.find((item) => Number.isFinite(Number(item?.handle)));
    if (!focused?.handle) return { handle: null, interactiveElements: [] };

    const listed = await callPywinautoTool('automation_elements', {
      operation: 'list',
      window_handle: Number(focused.handle),
      max_depth: 2,
    });

    return {
      handle: Number(focused.handle),
      interactiveElements: normalizePywinautoInteractiveElements(listed?.elements),
    };
  } catch (error) {
    appendPywinautoMcpLog(error.message || String(error), 'elements-fallback');
    return { handle: null, interactiveElements: [] };
  }
}

module.exports = {
  normalizeLine,
  normalizeComputerOcrText,
  buildPowerShellEncodedCommand,
  decodePowerShellCliXml,
  runPowerShellJson,
  buildComputerPowerShellPrelude,
  buildComputerWindowsStateScript,
  escapeSendKeysLiteral,
  buildSendKeysKeyToken,
  buildSendKeysCombo,
  convertHotkeyComboToSendKeys,
  normalizeComputerModifiers,
  buildComputerScreenshotRegionScript,
  probeOllamaStatus,
  ensurePywinautoMcpService,
  stopPywinautoMcpService,
  callPywinautoTool,
  readPywinautoActiveWindowDetails,
  normalizePywinautoInteractiveElements,
  unwrapPywinautoToolResult,
  getPywinautoMcpLogTail: () => pywinautoMcpLogTail,
};
