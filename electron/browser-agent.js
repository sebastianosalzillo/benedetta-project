const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { randomUUID } = require('crypto');
const fs = require('fs');
const {
  PINCHTAB_CLI_PATH,
  PINCHTAB_PS1_PATH,
  PINCHTAB_HOST,
  PINCHTAB_PORT,
  PINCHTAB_URL,
  PINCHTAB_TOKEN,
  PINCHTAB_HEADLESS,
  PINCHTAB_STARTUP_TIMEOUT_MS,
  PINCHTAB_SERVICE_POLL_MS,
  PINCHTAB_CONFIG_VERSION,
  MAX_PINCHTAB_LOG_TAIL,
  MAX_PROMPT_LINE_LENGTH,
  MAX_FIND_QUERY_LENGTH,
  MAX_BOT_SNAPSHOT_TEXT,
  MAX_BOT_TEXT_PREVIEW,
  BROWSER_NAV_WAIT_MS,
  BROWSER_ACTION_WAIT_AFTER_MS,
  BROWSER_ACTION_WAIT_FOCUS_MS,
  PINCHTAB_SINGLETON_FILES,
  PINCHTAB_SESSION_DIR,
  PINCHTAB_LOCK_FILE,
  PINCHTAB_RECOVERABLE_ERROR_PATTERNS,
} = require('./constants');
const { normalizeLine } = require('./workspace-manager');

/**
 * Normalize a URL-like string to a valid URL.
 * @param {string} urlLike - URL or search term
 * @returns {string} Normalized URL
 */
function normalizeBrowserUrl(urlLike) {
  const input = String(urlLike || '').trim();
  if (!input) return 'https://example.com';
  if (/^https?:\/\//i.test(input) || /^about:/i.test(input)) return input;
  if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i.test(input)) {
    return `https://${input.replace(/^https?:\/\//i, '')}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}

/**
 * Build a human-readable browser title from a URL-like value.
 *
 * @param {string} urlLike
 * @returns {string}
 */
function buildBrowserTitleFromUrl(urlLike) {
  try {
    const parsed = new URL(normalizeBrowserUrl(urlLike));
    return parsed.hostname.replace(/^www\./i, '') || 'Browser';
  } catch {
    return 'Browser';
  }
}

/**
 * Normalize canvas layout aliases used by browser/canvas directives.
 *
 * @param {string} layout
 * @returns {string}
 */
function normalizeCanvasLayout(layout) {
  const value = String(layout || '').trim().toLowerCase();
  const aliasMap = {
    right: 'right-docked', docked: 'right-docked', 'right-docked': 'right-docked',
    split: 'split-50', 'split-50': 'split-50', half: 'split-50',
  };
  return aliasMap[value] || 'right-docked';
}

/**
 * Check whether an error indicates a missing PinchTab route.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isPinchtabRouteNotFoundError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('404') || message.includes('page not found') || message.includes('not found');
}

/**
 * Map a tab-scoped endpoint to a supported global fallback endpoint.
 *
 * @param {string} endpoint
 * @returns {string}
 */
function getPinchtabGlobalFallbackEndpoint(endpoint) {
  const normalized = String(endpoint || '').trim();
  if (!normalized.startsWith('/')) return '';
  if (normalized.startsWith('/snapshot')) return '/snapshot';
  if (normalized.startsWith('/text')) return '/text';
  if (normalized.startsWith('/screenshot')) return '/screenshot';
  if (normalized.startsWith('/action')) return '/action';
  if (normalized.startsWith('/evaluate')) return '/evaluate';
  if (normalized.startsWith('/navigate')) return '/navigate';
  if (normalized.startsWith('/find')) return '/find';
  return '';
}

/**
 * Check whether a PinchTab action error is recoverable via refresh/rematch flows.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isPinchtabRecoverableActionError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return PINCHTAB_RECOVERABLE_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern.match) && message.includes(pattern.and) && (!pattern.and2 || message.includes(pattern.and2))
  );
}

// ============================================================
// PinchTab Service Manager
// ============================================================

let pinchtabProcess = null;
let pinchtabStartupPromise = null;
let pinchtabLogTail = '';
let pinchtabAuthToken = PINCHTAB_TOKEN;

function hasPinchtabLauncher() {
  return fs.existsSync(PINCHTAB_CLI_PATH) || fs.existsSync(PINCHTAB_PS1_PATH);
}

/**
 * Resolve the profile path used for the managed PinchTab browser instance.
 *
 * @returns {string}
 */
function getPinchtabProfilePath() {
  const { app } = require('electron');
  const profilePath = path.join(app.getPath('userData'), 'pinchtab-profiles', 'avatar-desktop');
  fs.mkdirSync(profilePath, { recursive: true });
  return profilePath;
}

function getPinchtabConfigPath() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'pinchtab-config.json');
}

function getPinchtabStateDir() {
  const { app } = require('electron');
  const stateDir = path.join(app.getPath('userData'), 'pinchtab-runtime');
  fs.mkdirSync(stateDir, { recursive: true });
  return stateDir;
}

function getPinchtabProfilesBaseDir() {
  const { app } = require('electron');
  const profilesDir = path.join(app.getPath('userData'), 'pinchtab-profiles');
  fs.mkdirSync(profilesDir, { recursive: true });
  return profilesDir;
}

function readPinchtabConfigIfPresent() {
  const { app } = require('electron');
  if (!app?.isReady?.()) return null;
  try {
    const configPath = getPinchtabConfigPath();
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function syncPinchtabAuthTokenFromConfig() {
  if (PINCHTAB_TOKEN) { pinchtabAuthToken = PINCHTAB_TOKEN; return pinchtabAuthToken; }
  const existing = readPinchtabConfigIfPresent();
  const configToken = String(existing?.server?.token || '').trim();
  if (configToken) { pinchtabAuthToken = configToken; return pinchtabAuthToken; }
  pinchtabAuthToken = randomUUID().replace(/-/g, '');
  return pinchtabAuthToken;
}

function ensurePinchtabConfig(profilePath) {
  const configPath = getPinchtabConfigPath();
  const stateDir = getPinchtabStateDir();
  const profilesDir = getPinchtabProfilesBaseDir();
  const existing = readPinchtabConfigIfPresent();
  const resolvedToken = syncPinchtabAuthTokenFromConfig();
  pinchtabAuthToken = resolvedToken;

  const nextConfig = {
    configVersion: PINCHTAB_CONFIG_VERSION,
    server: { bind: PINCHTAB_HOST, port: String(PINCHTAB_PORT), stateDir, token: resolvedToken },
    instanceDefaults: { mode: PINCHTAB_HEADLESS ? 'headless' : 'headed', noRestore: true },
    security: { allowEvaluate: true, idpi: { enabled: false } },
    profiles: { baseDir: profilesDir, defaultProfile: path.basename(profilePath) },
    multiInstance: { strategy: 'always-on', allocationPolicy: 'fcfs' },
  };

  try {
    if (existing && JSON.stringify(existing) === JSON.stringify(nextConfig)) return configPath;
  } catch { /* overwrite invalid config */ }

  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));
  return configPath;
}

function appendPinchtabLog(chunk, source) {
  const line = `[${source}] ${String(chunk || '').trim()}`;
  if (!line.trim()) return;
  pinchtabLogTail = `${pinchtabLogTail}\n${line}`.trim().slice(-MAX_PINCHTAB_LOG_TAIL);
}

function listPinchtabChromePids(profilePath) {
  if (process.platform !== 'win32') return [];
  const escapedProfile = String(profilePath || '').replace(/'/g, "''");
  const script = [
    '$profile = $args[0]',
    "Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe'\" |",
    'Where-Object { $_.CommandLine -like "*$profile*" } |',
    'Select-Object -ExpandProperty ProcessId',
  ].join(' ');

  try {
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script, escapedProfile,
    ], { windowsHide: true, encoding: 'utf8' });
    if (result.error) { appendPinchtabLog(result.error.message, 'cleanup-error'); return []; }
    return String(result.stdout || '')
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch (error) {
    appendPinchtabLog(error.message, 'cleanup-error');
    return [];
  }
}

function pauseWindowsCleanup(ms = 250) {
  if (process.platform !== 'win32') return;
  try {
    spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Start-Sleep -Milliseconds ${Math.max(0, Math.round(Number(ms) || 0))}`,
    ], { windowsHide: true, stdio: 'ignore' });
  } catch { /* ignore */ }
}

function getListeningProcessIdForPort(port) {
  if (process.platform !== 'win32') return null;
  try {
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      '$owningPid=(Get-NetTCPConnection -LocalPort $args[0] -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess); if($owningPid){ Write-Output $owningPid }',
      String(port),
    ], { windowsHide: true, encoding: 'utf8' });
    const pid = Number(String(result.stdout || '').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch { return null; }
}

function getProcessDetails(pid) {
  if (!pid || process.platform !== 'win32') return null;
  try {
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      '$proc=Get-CimInstance Win32_Process -Filter "ProcessId = $args[0]" -ErrorAction SilentlyContinue; if($proc){ [pscustomobject]@{ Name=$proc.Name; CommandLine=$proc.CommandLine } | ConvertTo-Json -Compress }',
      String(pid),
    ], { windowsHide: true, encoding: 'utf8' });
    return result.stdout ? JSON.parse(String(result.stdout || '').trim()) : null;
  } catch { return null; }
}

function killPinchtabListenerProcess() {
  const pid = getListeningProcessIdForPort(PINCHTAB_PORT);
  if (!pid) return false;
  const details = getProcessDetails(pid);
  const name = String(details?.Name || '').toLowerCase();
  const commandLine = String(details?.CommandLine || '').toLowerCase();
  const looksLikePinchtab = name.includes('pinchtab') || commandLine.includes('pinchtab') || commandLine.includes(`:${PINCHTAB_PORT}`);
  if (!looksLikePinchtab) return false;
  try {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    appendPinchtabLog(`killed conflicting PinchTab listener on port ${PINCHTAB_PORT} pid=${pid}`, 'cleanup');
    pauseWindowsCleanup(500);
    return true;
  } catch { return false; }
}

function killPinchtabChromeProcesses(profilePath) {
  const seenPids = new Set();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const pids = listPinchtabChromePids(profilePath);
    if (!pids.length) break;
    for (const pid of pids) {
      seenPids.add(pid);
      try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* ignore */ }
    }
    pauseWindowsCleanup(300);
  }
  if (seenPids.size) {
    appendPinchtabLog(`killed stale Chrome profile processes: ${Array.from(seenPids).join(', ')}`, 'cleanup');
  }
}

function focusPinchtabChromeWindow(profilePath) {
  if (process.platform !== 'win32') return;
  const pids = listPinchtabChromePids(profilePath);
  if (!pids.length) return;
  const script = [
    'Add-Type -AssemblyName Microsoft.VisualBasic',
    '$pids = $args | ForEach-Object { [int]$_ }',
    '$ordered = Get-Process -Id $pids -ErrorAction SilentlyContinue | Sort-Object StartTime -Descending',
    'foreach ($proc in $ordered) { try { [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id) | Out-Null; break } catch { } }',
  ].join('; ');
  try {
    spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script, ...pids.map(String)], {
      windowsHide: true, stdio: 'ignore',
    });
  } catch { /* ignore */ }
}

function clearPinchtabSessionRestoreFiles(profilePath) {
  const sessionsDir = path.join(profilePath, PINCHTAB_SESSION_DIR);
  if (!fs.existsSync(sessionsDir)) return;
  try {
    for (const entry of fs.readdirSync(sessionsDir)) {
      try { fs.rmSync(path.join(sessionsDir, entry), { force: true, recursive: true }); } catch (error) {
        appendPinchtabLog(`failed to delete session file: ${error.message}`, 'cleanup');
      }
    }
  } catch (error) {
    appendPinchtabLog(`failed to inspect session restore dir: ${error.message}`, 'cleanup');
  }
}

function clearPinchtabSingletonFiles(profilePath) {
  const candidates = [
    ...PINCHTAB_SINGLETON_FILES.map((f) => path.join(profilePath, f)),
    path.join(profilePath, PINCHTAB_LOCK_FILE),
  ];
  for (const targetPath of candidates) {
    if (!fs.existsSync(targetPath)) continue;
    try { fs.rmSync(targetPath, { force: true, recursive: true }); } catch (error) {
      appendPinchtabLog(`failed to delete lock file: ${error.message}`, 'cleanup');
    }
  }
}

function cleanupPinchtabProfile(profilePath) {
  killPinchtabChromeProcesses(profilePath);
  clearPinchtabSingletonFiles(profilePath);
  clearPinchtabSessionRestoreFiles(profilePath);
}

function createPinchtabHeaders(headers = {}) {
  const nextHeaders = { ...headers };
  const authToken = syncPinchtabAuthTokenFromConfig();
  if (authToken) nextHeaders.Authorization = `Bearer ${authToken}`;
  return nextHeaders;
}

/**
 * Probe the local PinchTab bridge health endpoint.
 *
 * @returns {Promise<Object|null>}
 */
async function probePinchtabHealth() {
  try {
    const response = await fetch(`${PINCHTAB_URL}/health`, { headers: createPinchtabHeaders() });
    if (response.status === 401) return { unauthorized: true };
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    return data || { ok: true };
  } catch { return null; }
}

/**
 * Stop the managed PinchTab service and clean up its profile state.
 *
 * @returns {void}
 */
function stopPinchtabService() {
  const { app } = require('electron');
  const profilePath = app?.isReady?.() ? getPinchtabProfilePath() : null;
  if (!pinchtabProcess) { if (profilePath) cleanupPinchtabProfile(profilePath); return; }
  try {
    if (process.platform === 'win32' && pinchtabProcess.pid) {
      spawnSync('taskkill', ['/PID', String(pinchtabProcess.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else { pinchtabProcess.kill('SIGTERM'); }
  } catch { /* ignore */ }
  pinchtabProcess = null;
  if (profilePath) cleanupPinchtabProfile(profilePath);
}

/**
 * Ensure the managed PinchTab bridge is running and responsive.
 *
 * @returns {Promise<Object>}
 */
async function ensurePinchtabService() {
  const healthy = await probePinchtabHealth();
  if (healthy && !healthy.unauthorized) return healthy;
  if (healthy?.unauthorized) killPinchtabListenerProcess();
  if (pinchtabStartupPromise) return pinchtabStartupPromise;

  pinchtabStartupPromise = (async () => {
    if (!hasPinchtabLauncher()) throw new Error(`PinchTab launcher not found: ${PINCHTAB_CLI_PATH}`);
    pinchtabLogTail = '';
    if (pinchtabProcess) stopPinchtabService();
    const profilePath = getPinchtabProfilePath();
    const configPath = ensurePinchtabConfig(profilePath);
    fs.mkdirSync(profilePath, { recursive: true });
    cleanupPinchtabProfile(profilePath);

    if (!pinchtabProcess || pinchtabProcess.killed) {
      pinchtabProcess = spawn('node', [PINCHTAB_CLI_PATH, 'bridge'], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: {
          ...process.env,
          PINCHTAB_CONFIG: configPath,
          PINCHTAB_BIND: PINCHTAB_HOST,
          PINCHTAB_PORT: String(PINCHTAB_PORT),
          BRIDGE_BIND: PINCHTAB_HOST,
          BRIDGE_PORT: String(PINCHTAB_PORT),
          BRIDGE_HEADLESS: PINCHTAB_HEADLESS ? 'true' : 'false',
          BRIDGE_PROFILE: profilePath,
          BRIDGE_NO_RESTORE: 'true',
          ...(pinchtabAuthToken ? { PINCHTAB_TOKEN: pinchtabAuthToken, BRIDGE_TOKEN: pinchtabAuthToken } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      pinchtabProcess.stdout.on('data', (chunk) => appendPinchtabLog(chunk, 'stdout'));
      pinchtabProcess.stderr.on('data', (chunk) => appendPinchtabLog(chunk, 'stderr'));
      pinchtabProcess.on('exit', (code, signal) => {
        appendPinchtabLog(`process exited code=${code} signal=${signal}`, 'exit');
        pinchtabProcess = null;
      });
      pinchtabProcess.on('error', (error) => appendPinchtabLog(error.message, 'spawn-error'));
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < PINCHTAB_STARTUP_TIMEOUT_MS) {
      const data = await probePinchtabHealth();
      if (data) { focusPinchtabChromeWindow(profilePath); return data; }
      if (!pinchtabProcess) throw new Error(`PinchTab exited before becoming ready.\n${pinchtabLogTail}`);
      await new Promise((r) => setTimeout(r, PINCHTAB_SERVICE_POLL_MS));
    }
    throw new Error(`PinchTab startup timeout after ${PINCHTAB_STARTUP_TIMEOUT_MS} ms.\n${pinchtabLogTail}`);
  })();

  try { return await pinchtabStartupPromise; } finally { pinchtabStartupPromise = null; }
}

/**
 * Perform a raw HTTP request against the PinchTab bridge.
 *
 * @param {string} endpoint
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
async function pinchtabRequest(endpoint, options = {}) {
  await ensurePinchtabService();
  let response = await fetch(`${PINCHTAB_URL}${endpoint}`, { ...options, headers: createPinchtabHeaders(options.headers) });

  if (response.status === 401) {
    const detail = await response.text().catch(() => response.statusText);
    const normalizedDetail = String(detail || '').toLowerCase();
    if (normalizedDetail.includes('unauthorized') || normalizedDetail.includes('bad_token')) {
      appendPinchtabLog(`unauthorized response for ${endpoint}, restarting bridge`, 'auth');
      pinchtabAuthToken = '';
      killPinchtabListenerProcess();
      stopPinchtabService();
      await ensurePinchtabService();
      response = await fetch(`${PINCHTAB_URL}${endpoint}`, { ...options, headers: createPinchtabHeaders(options.headers) });
    } else {
      throw new Error(`PinchTab request failed for ${endpoint}: ${detail || response.status}`);
    }
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`PinchTab request failed for ${endpoint}: ${detail || response.status}`);
  }
  return response;
}

/**
 * Perform a PinchTab request and parse the JSON response.
 *
 * @param {string} endpoint
 * @param {RequestInit} [options]
 * @returns {Promise<Object>}
 */
async function pinchtabRequestJson(endpoint, options = {}) {
  const response = await pinchtabRequest(endpoint, options);
  return response.json().catch(() => ({}));
}

// ============================================================
// Tab-scoped requests with fallback
// ============================================================

function normalizePinchtabTabId(tabId) {
  return encodeURIComponent(String(tabId || '').trim());
}

function getPinchtabEndpointForTab(tabId, endpoint) {
  const normalizedEndpoint = String(endpoint || '').trim();
  if (!normalizedEndpoint.startsWith('/')) throw new Error(`Invalid PinchTab endpoint: ${endpoint}`);
  const normalizedTabId = String(tabId || '').trim();
  if (!normalizedTabId) return normalizedEndpoint;
  return `/tabs/${normalizePinchtabTabId(normalizedTabId)}${normalizedEndpoint}`;
}

async function pinchtabTabRequest(tabId, endpoint, options = {}) {
  const normalizedTabId = String(tabId || '').trim();
  if (!normalizedTabId) return pinchtabRequest(endpoint, options);
  try {
    return await pinchtabRequest(getPinchtabEndpointForTab(normalizedTabId, endpoint), options);
  } catch (error) {
    const fallbackEndpoint = getPinchtabGlobalFallbackEndpoint(endpoint);
    if (!fallbackEndpoint || !isPinchtabRouteNotFoundError(error)) throw error;
    appendPinchtabLog(`tab-scoped route unavailable for ${endpoint}, falling back to ${fallbackEndpoint}`, 'compat');
    return pinchtabRequest(fallbackEndpoint, options);
  }
}

async function pinchtabTabRequestJson(tabId, endpoint, options = {}) {
  const response = await pinchtabTabRequest(tabId, endpoint, options);
  return response.json().catch(() => ({}));
}

// ============================================================
// Tab management
// ============================================================

async function listPinchtabTabs() {
  const tabsData = await pinchtabRequestJson('/tabs');
  return Array.isArray(tabsData?.tabs) ? tabsData.tabs : [];
}

function pickBestPinchtabTabId(tabs = [], preferredTabId = '', browserUrl = '', browserTitle = '') {
  const normalizedPreferred = String(preferredTabId || '').trim();
  if (normalizedPreferred && tabs.some((tab) => String(tab?.id || '').trim() === normalizedPreferred)) return normalizedPreferred;
  const normalizedUrl = String(browserUrl || '').trim();
  if (normalizedUrl) {
    const exactUrl = tabs.find((tab) => String(tab?.url || '').trim() === normalizedUrl);
    if (exactUrl?.id) return String(exactUrl.id).trim();
  }
  const normalizedTitle = String(browserTitle || '').trim();
  if (normalizedTitle) {
    const exactTitle = tabs.find((tab) => String(tab?.title || '').trim() === normalizedTitle);
    if (exactTitle?.id) return String(exactTitle.id).trim();
  }
  return String(tabs[0]?.id || '').trim();
}

async function resolvePinchtabTabState(content = {}, browserUrl = '', browserTitle = '') {
  const tabs = await listPinchtabTabs();
  const tabId = pickBestPinchtabTabId(
    tabs,
    content?.tabId,
    content?.currentUrl || content?.url || browserUrl,
    content?.pageTitle || content?.title || browserTitle,
  );
  return { tabId, tabs };
}

// ============================================================
// Browser actions
// ============================================================

async function runPinchtabAction(action = {}, tabId = '') {
  await pinchtabTabRequestJson(tabId, '/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
}

async function evaluatePinchtabExpression(expression = '', tabId = '') {
  return pinchtabTabRequestJson(tabId, '/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression: String(expression || '') }),
  });
}

async function findPinchtabRef(query = '', tabId = '') {
  const normalizedQuery = normalizeLine(query, MAX_FIND_QUERY_LENGTH);
  if (!normalizedQuery) return '';
  const result = await pinchtabTabRequestJson(tabId, '/find', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: normalizedQuery }),
  }).catch(() => null);
  return String(result?.best_ref || result?.bestRef || '').trim();
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ============================================================
// Snapshot parsing
// ============================================================

function parsePinchtabSnapshotText(snapshotText = '') {
  return String(snapshotText || '')
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([A-Za-z0-9_-]+):([^\s]+)\s*(.*)$/);
      if (!match) return { ref: '', role: 'node', label: line };
      return { ref: match[1], role: match[2], label: match[3] || match[2] };
    })
    .slice(0, 40);
}

function trimBrowserText(text, maxLength = 8000) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function getActiveBrowserSnapshotItem(ref = '', snapshotItems = []) {
  const targetRef = String(ref || '').trim();
  if (!targetRef) return null;
  return (snapshotItems || []).find((item) => String(item?.ref || '').trim() === targetRef) || null;
}

function getBrowserSnapshotItemByRef(content = {}, ref = '') {
  const targetRef = String(ref || '').trim();
  if (!targetRef) return null;
  return (content?.snapshotItems || []).find((item) => String(item?.ref || '').trim() === targetRef) || null;
}

function getBrowserTabId(beforeContent = {}, canvasState = {}) {
  return String(beforeContent?.tabId || canvasState?.content?.tabId || '').trim();
}

function extractSnapshotItemLabelText(item = {}) {
  const rawLabel = String(item?.label || '').replace(/\s+val="[^"]*"/gi, '').replace(/\s+/g, ' ').trim();
  if (!rawLabel) return '';
  const quotedMatch = rawLabel.match(/"([^"]+)"/);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();
  return rawLabel.replace(/^[^A-Za-z0-9]+/, '').trim();
}

function extractSnapshotItemValue(item = {}) {
  const rawLabel = String(item?.label || '');
  const quotedValue = rawLabel.match(/\bval="([^"]*)"/i);
  return quotedValue?.[1] ? quotedValue[1].trim() : '';
}

function isTextInputFallbackCandidate(item = {}) {
  const role = String(item?.role || '').trim().toLowerCase();
  return role.includes('textbox') || role.includes('searchbox');
}

function isClickFallbackCandidate(item = {}) {
  const role = String(item?.role || '').trim().toLowerCase();
  return role.includes('button') || role.includes('link');
}

function sanitizeBrowserActionText(text = '') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized
    .replace(/\b(?:enter|return|invio|tab|escape|esc|ctrl|control|alt|shift)\b/gi, ' ')
    .replace(/[+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// Browser state comparison
// ============================================================

function getBrowserComparableState(content = {}) {
  return {
    currentUrl: String(content?.currentUrl || content?.url || '').trim(),
    pageTitle: String(content?.pageTitle || content?.title || '').trim(),
    text: trimBrowserText(content?.text || '', 600),
    snapshotText: String(content?.snapshotText || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
  };
}

function didBrowserStateChange(beforeContent = {}, afterContent = {}) {
  const before = getBrowserComparableState(beforeContent);
  const after = getBrowserComparableState(afterContent);
  return before.currentUrl !== after.currentUrl || before.pageTitle !== after.pageTitle || before.text !== after.text || before.snapshotText !== after.snapshotText;
}

function didBrowserClickProgress(beforeContent = {}, afterContent = {}) {
  const before = getBrowserComparableState(beforeContent);
  const after = getBrowserComparableState(afterContent);
  return before.currentUrl !== after.currentUrl || before.pageTitle !== after.pageTitle || before.text !== after.text;
}

// ============================================================
// Click fallbacks
// ============================================================

function buildClickFallbackExpression(item = {}) {
  const targetLabel = extractSnapshotItemLabelText(item);
  const targetRole = String(item?.role || '').trim().toLowerCase();
  const roleSelector = targetRole.includes('link')
    ? 'a,[role="link"]'
    : 'button,[role="button"],input[type="button"],input[type="submit"]';

  return `(() => {
    const targetLabel = ${JSON.stringify(targetLabel)};
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const describe = (element) => normalize(element?.innerText || element?.textContent || element?.getAttribute?.('aria-label') || element?.value || element?.title || '');
    const target = normalize(targetLabel);
    const active = document.activeElement;
    const activeText = describe(active);
    const roleOk = active && active.matches && active.matches(${JSON.stringify(roleSelector)});
    if (roleOk && (!target || activeText === target || activeText.includes(target) || target.includes(activeText))) { active.click(); return { clicked: true, strategy: 'active-element', text: activeText }; }
    const candidates = [...document.querySelectorAll(${JSON.stringify(roleSelector)})];
    const exact = candidates.find((element) => { const text = describe(element); return target && text && (text === target || text.includes(target) || target.includes(text)); });
    const fallback = exact || candidates.find((element) => { const text = describe(element); return !target && text; });
    if (!fallback) return { clicked: false, reason: 'no-match', targetLabel };
    fallback.click();
    return { clicked: true, strategy: 'selector-match', text: describe(fallback) };
  })()`;
}

async function runBrowserClickFallbacks(ref, beforeContent, item, canvasState, refreshBrowserCanvas) {
  const browserTabId = getBrowserTabId(beforeContent, canvasState);
  if (!ref || !isClickFallbackCandidate(item)) return null;

  try {
    await runPinchtabAction({ kind: 'focus', ref }, browserTabId);
    await sleep(BROWSER_ACTION_WAIT_FOCUS_MS);
    await runPinchtabAction({ kind: 'press', key: 'Enter' }, browserTabId);
    const focusedRefresh = await refreshBrowserCanvas({}, { navigate: false, showCanvas: false });
    if (didBrowserClickProgress(beforeContent, focusedRefresh.state?.content || {})) {
      return { ok: true, recovered: true, state: focusedRefresh.state, clickFallback: 'focus-enter', warning: 'Click ref non efficace. Fallback focus+Enter riuscito.' };
    }
  } catch { /* try DOM click fallback */ }

  try {
    await runPinchtabAction({ kind: 'focus', ref }, browserTabId).catch(() => null);
    await evaluatePinchtabExpression(buildClickFallbackExpression(item), browserTabId);
    const evalRefresh = await refreshBrowserCanvas({}, { navigate: false, showCanvas: false });
    if (didBrowserClickProgress(beforeContent, evalRefresh.state?.content || {})) {
      return { ok: true, recovered: true, state: evalRefresh.state, clickFallback: 'eval-click', warning: 'Click ref non efficace. Fallback DOM click riuscito.' };
    }
  } catch { /* ignore */ }

  return null;
}

function buildFindQueryFromSnapshotItem(item = {}, action = {}) {
  const label = extractSnapshotItemLabelText(item);
  const role = String(item?.role || '').trim();
  const value = String(action?.value || action?.text || '').trim();
  return [label, value, role].filter(Boolean).join(' ');
}

async function retryBrowserActionWithFind(action = {}, beforeContent = {}, item = {}, canvasState, refreshBrowserCanvas, findPinchtabRef) {
  const browserTabId = getBrowserTabId(beforeContent, canvasState);
  if (!browserTabId || !action.ref) return null;
  const rematchedRef = await findPinchtabRef(buildFindQueryFromSnapshotItem(item, action), browserTabId);
  if (!rematchedRef || rematchedRef === action.ref) return null;
  await runPinchtabAction({ ...action, ref: rematchedRef }, browserTabId);
  const refreshed = await refreshBrowserCanvas({}, { navigate: false, showCanvas: false });
  return { ok: true, recovered: true, state: refreshed.state, staleRef: true, rematchedRef, warning: `Ref browser aggiornato semanticamente da ${action.ref} a ${rematchedRef}.` };
}

async function runBrowserInputFallbacks(action = {}, beforeContent = {}, canvasState, refreshBrowserCanvas) {
  const browserTabId = getBrowserTabId(beforeContent, canvasState);
  const targetItem = getBrowserSnapshotItemByRef(beforeContent, action.ref);
  if (!browserTabId || action.kind !== 'type' || !action.ref || !action.text || !isTextInputFallbackCandidate(targetItem)) return null;

  try {
    await runPinchtabAction({ kind: 'fill', ref: action.ref, text: action.text }, browserTabId);
    const refreshed = await refreshBrowserCanvas({}, { navigate: false, showCanvas: false });
    const nextItem = getBrowserSnapshotItemByRef(refreshed.state?.content, action.ref);
    if (extractSnapshotItemValue(nextItem) === action.text || didBrowserStateChange(beforeContent, refreshed.state?.content || {})) {
      return { ok: true, recovered: true, state: refreshed.state, inputFallback: 'fill', warning: 'Type ref non affidabile. Fallback fill riuscito.' };
    }
  } catch { /* ignore */ }
  return null;
}

function isYouTubeSearchRef(ref = '', currentUrl = '', snapshotItems = []) {
  if (!currentUrl.includes('youtube.com')) return false;
  const item = getBrowserSnapshotItemByRef({ snapshotItems }, ref);
  const label = String(item?.label || '').toLowerCase();
  const role = String(item?.role || '').toLowerCase();
  return role.includes('textbox') || label.includes('search') || label.includes('cerca') || label.includes('ricerca');
}

function buildYouTubeSearchUrl(queryText = '') {
  const query = sanitizeBrowserActionText(queryText);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

// ============================================================
// Browser action execution
// ============================================================

/**
 * Execute a browser action against the active PinchTab tab/context.
 *
 * @param {Object} payload
 * @param {Object} getCanvasState
 * @param {Function} refreshBrowserCanvas
 * @returns {Promise<Object>}
 */
async function performBrowserAction(payload = {}, getCanvasState, refreshBrowserCanvas) {
  const kind = String(payload.kind || '').trim().toLowerCase();
  if (!kind) return { ok: false, error: 'Missing browser action kind' };

  const beforeContent = getCanvasState.content?.type === 'browser' ? { ...getCanvasState.content } : {};
  const browserTabId = String(payload.tabId || beforeContent.tabId || getCanvasState.content?.tabId || '').trim();
  const action = { kind };
  if (payload.ref) action.ref = String(payload.ref).trim();
  if (payload.text != null) action.text = sanitizeBrowserActionText(payload.text);
  if (payload.value != null) action.value = sanitizeBrowserActionText(payload.value);
  if (payload.key) action.key = String(payload.key).trim();
  if (Object.prototype.hasOwnProperty.call(payload, 'waitNav')) action.waitNav = Boolean(payload.waitNav);

  if (['click', 'type', 'focus', 'hover', 'scroll', 'select'].includes(kind) && !action.ref) {
    return { ok: false, error: 'Browser action requires a ref' };
  }
  if ((kind === 'type' || kind === 'fill') && !action.text) {
    return { ok: false, error: 'Browser typing requires text' };
  }
  if (kind === 'select') {
    action.value = action.value || action.text || '';
    delete action.text;
    if (!action.value) return { ok: false, error: 'Browser select requires value' };
  }
  if (kind === 'press' && !action.key) action.key = 'Enter';

  const currentUrl = String(getCanvasState.content?.currentUrl || getCanvasState.content?.url || '');
  if (['type', 'fill'].includes(kind) && action.ref && action.text && isYouTubeSearchRef(action.ref, currentUrl, beforeContent.snapshotItems)) {
    return refreshBrowserCanvas({ ...beforeContent, type: 'browser', title: 'youtube.com', url: buildYouTubeSearchUrl(action.text) }, { navigate: true, showCanvas: false });
  }

  const targetSnapshotItem = action.ref ? getActiveBrowserSnapshotItem(action.ref, beforeContent.snapshotItems) : null;

  try {
    await runPinchtabAction(action, browserTabId);
    const refreshed = await refreshBrowserCanvas({}, { navigate: false, showCanvas: false });

    if (kind === 'type' && action.ref && action.text) {
      const typedItem = getBrowserSnapshotItemByRef(refreshed.state?.content, action.ref);
      if (extractSnapshotItemValue(typedItem) !== action.text) {
        const inputFallbackResult = await runBrowserInputFallbacks(action, beforeContent, getCanvasState, refreshBrowserCanvas);
        if (inputFallbackResult) return inputFallbackResult;
      }
    }
    if (kind === 'click' && action.ref && isClickFallbackCandidate(targetSnapshotItem) && !didBrowserClickProgress(beforeContent, refreshed.state?.content || {})) {
      const fallbackResult = await runBrowserClickFallbacks(action.ref, beforeContent, targetSnapshotItem, getCanvasState, refreshBrowserCanvas);
      if (fallbackResult) return fallbackResult;
    }
    return refreshed;
  } catch (error) {
    if (action.ref && targetSnapshotItem) {
      const rematchResult = await retryBrowserActionWithFind(action, beforeContent, targetSnapshotItem, getCanvasState, refreshBrowserCanvas, findPinchtabRef).catch(() => null);
      if (rematchResult) return rematchResult;
    }
    if (kind === 'click' && action.ref && isClickFallbackCandidate(targetSnapshotItem)) {
      const fallbackResult = await runBrowserClickFallbacks(action.ref, beforeContent, targetSnapshotItem, getCanvasState, refreshBrowserCanvas);
      if (fallbackResult) return fallbackResult;
    }
    if (isPinchtabRecoverableActionError(error)) {
      const refreshed = await refreshBrowserCanvas({}, { navigate: false, showCanvas: false });
      return { ok: true, recovered: true, state: refreshed.state, staleRef: true, warning: 'Azione browser non piu valida sul DOM corrente. Snapshot aggiornata e loop ripreso.' };
    }
    return { ok: false, error: error?.message || String(error) };
  }
}

// ============================================================
// Browser canvas resolution
// ============================================================

/**
 * Snapshot cache entry.
 * @typedef {Object} SnapshotCacheEntry
 * @property {string} url - The URL this snapshot is for
 * @property {string} tabId - The browser tab ID
 * @property {string} pageTitle - Page title at time of snapshot
 * @property {string} snapshotText - The raw snapshot text
 * @property {Array} snapshotItems - Parsed snapshot items
 * @property {string} text - Page text content
 * @property {string} screenshotSrc - Base64 screenshot data URI
 * @property {number} timestamp - When this was captured (Date.now())
 */

/** @type {SnapshotCacheEntry|null} Recent snapshot cache to avoid redundant fetches */
let recentSnapshotCache = null;
const SNAPSHOT_CACHE_TTL_MS = 3000; // 3 seconds — reuse if no navigation occurred

/**
 * Resolve browser canvas content by navigating, snapshotting and capturing state.
 *
 * Reuses recent snapshot if URL hasn't changed and cache is still valid (3s TTL).
 *
 * @param {Object} content
 * @param {{ navigate?: boolean }} [options]
 * @returns {Promise<Object>}
 */
async function resolveBrowserCanvasContent(content = {}, options = {}) {
  const browserUrl = normalizeBrowserUrl(content.url || content.currentUrl || content.value || '');
  const browserTitle = String(content.title || '').trim() || buildBrowserTitleFromUrl(browserUrl);

  // Check snapshot cache — reuse if URL unchanged and within TTL
  const now = Date.now();
  if (
    recentSnapshotCache &&
    recentSnapshotCache.url === browserUrl &&
    (now - recentSnapshotCache.timestamp) < SNAPSHOT_CACHE_TTL_MS &&
    options.navigate !== false
  ) {
    return {
      ...content,
      type: 'browser',
      title: recentSnapshotCache.pageTitle || browserTitle,
      url: browserUrl,
      currentUrl: browserUrl,
      pageTitle: recentSnapshotCache.pageTitle || browserTitle,
      tabId: recentSnapshotCache.tabId || String(content.tabId || '').trim(),
      tabs: Array.isArray(content.tabs) ? content.tabs : [],
      text: recentSnapshotCache.text || String(content.text || ''),
      snapshotText: recentSnapshotCache.snapshotText || String(content.snapshotText || ''),
      snapshotItems: recentSnapshotCache.snapshotItems || Array.isArray(content.snapshotItems) ? content.snapshotItems : [],
      screenshotSrc: recentSnapshotCache.screenshotSrc || String(content.screenshotSrc || ''),
      status: 'ready',
      message: '',
      lastUpdatedAt: new Date().toISOString(),
      cacheHit: true,
    };
  }

  try {
    let tabState = null;
    if (options.navigate !== false) {
      tabState = await resolvePinchtabTabState(content, browserUrl, browserTitle);
      if (tabState?.tabId) {
        await pinchtabTabRequestJson(tabState.tabId, '/navigate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: browserUrl }),
        });
      } else {
        await pinchtabRequestJson('/navigate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: browserUrl }),
        });
      }
      await sleep(BROWSER_NAV_WAIT_MS);
      if (!PINCHTAB_HEADLESS) {
        const profilePath = getPinchtabProfilePath();
        focusPinchtabChromeWindow(profilePath);
      }
    } else {
      await ensurePinchtabService();
    }

    tabState = await resolvePinchtabTabState(content, browserUrl, browserTitle);
    const activeTabId = tabState?.tabId || '';
    const [textData, snapshotText, screenshotData] = await Promise.all([
      activeTabId ? pinchtabTabRequestJson(activeTabId, '/text') : pinchtabRequestJson('/text'),
      (activeTabId ? pinchtabTabRequest(activeTabId, '/snapshot?filter=interactive&format=compact&maxTokens=1800') : pinchtabRequest('/snapshot?filter=interactive&format=compact&maxTokens=1800')).then((r) => r.text()),
      activeTabId ? pinchtabTabRequestJson(activeTabId, '/screenshot') : pinchtabRequestJson('/screenshot'),
    ]);

    const result = {
      ...content,
      type: 'browser',
      title: browserTitle || String(textData?.title || browserTitle).trim() || 'Browser',
      url: browserUrl,
      currentUrl: String(textData?.url || browserUrl).trim() || browserUrl,
      pageTitle: String(textData?.title || browserTitle).trim() || browserTitle,
      tabId: String(activeTabId || content.tabId || '').trim(),
      tabs: Array.isArray(tabState?.tabs) ? tabState.tabs : [],
      text: trimBrowserText(textData?.text || ''),
      snapshotText: String(snapshotText || '').trim(),
      snapshotItems: parsePinchtabSnapshotText(snapshotText),
      screenshotSrc: screenshotData?.base64 ? `data:image/jpeg;base64,${screenshotData.base64}` : '',
      status: 'ready',
      message: '',
      lastUpdatedAt: new Date().toISOString(),
      cacheHit: false,
    };

    // Update snapshot cache
    recentSnapshotCache = {
      url: browserUrl,
      tabId: String(activeTabId || '').trim(),
      pageTitle: result.pageTitle,
      snapshotText: result.snapshotText,
      snapshotItems: result.snapshotItems,
      text: result.text,
      screenshotSrc: result.screenshotSrc,
      timestamp: Date.now(),
    };

    return result;
  } catch (error) {
    return {
      ...content,
      type: 'browser',
      title: browserTitle || 'Browser',
      url: browserUrl,
      currentUrl: String(content.currentUrl || browserUrl).trim() || browserUrl,
      pageTitle: String(content.pageTitle || browserTitle).trim(),
      tabId: String(content.tabId || '').trim(),
      tabs: Array.isArray(content.tabs) ? content.tabs : [],
      text: String(content.text || ''),
      snapshotText: String(content.snapshotText || ''),
      snapshotItems: Array.isArray(content.snapshotItems) ? content.snapshotItems : [],
      screenshotSrc: String(content.screenshotSrc || ''),
      status: 'error',
      message: error?.message || String(error),
      lastUpdatedAt: new Date().toISOString(),
    };
  }
}

// ============================================================
// Browser Autopilot
// ============================================================

/**
 * Summarize a browser directive for logs/status output.
 *
 * @param {Object} directive
 * @returns {string}
 */
function summarizeBrowserDirective(directive = {}) {
  const action = String(directive.action || directive.kind || 'refresh').trim().toLowerCase();
  if (!action) return 'refresh';
  if (['open', 'show', 'navigate'].includes(action)) {
    return directive.url || directive.value ? `open ${directive.url || directive.value}` : 'open page';
  }
  if (action === 'click') return directive.ref ? `click ref ${directive.ref}` : 'click';
  if (action === 'type' || action === 'fill') return directive.ref ? `type into ref ${directive.ref}` : 'type';
  if (action === 'press') return `press ${directive.key || 'Enter'}`;
  if (action === 'refresh') return 'refresh page';
  return action;
}

/**
 * Summarize the free-text reason attached to a browser autopilot response.
 *
 * @param {Object} response
 * @returns {string}
 */
function summarizeBrowserReason(response = {}) {
  return normalizeLine(response.reasoning || response.speech || '', MAX_PROMPT_LINE_LENGTH);
}

/**
 * Check whether an autopilot response should terminate the browser loop.
 *
 * @param {Object} response
 * @returns {boolean}
 */
function isBrowserAutopilotTerminalResponse(response = {}) {
  const speech = normalizeLine(response?.speech || '', 500).toLowerCase();
  if (!speech) return false;
  const terminalPatterns = [
    'ho trovato', 'ecco il video', 'ecco i risultati', 'task completato', 'completato',
    'mi fermo', 'serve una verifica manuale', 'serve verifica manuale', 'non sono riuscito',
    'sono bloccato', 'sono bloccata', 'non posso procedere', 'captcha', 'otp', '2fa',
    'verifica email', 'verifica via email', 'verifica telefono', 'verifica via sms', 'sms richiesto', 'codice sms',
  ];
  return terminalPatterns.some((pattern) => speech.includes(pattern));
}

module.exports = {
  // Service
  hasPinchtabLauncher,
  ensurePinchtabService,
  stopPinchtabService,
  cleanupPinchtabProfile,
  getPinchtabProfilePath,
  pinchtabRequest,
  pinchtabRequestJson,
  pinchtabTabRequest,
  pinchtabTabRequestJson,
  probePinchtabHealth,
  getPinchtabLogTail: () => pinchtabLogTail,
  getPinchtabAuthToken: () => pinchtabAuthToken,
  setPinchtabAuthToken: (token) => { pinchtabAuthToken = String(token || '').trim(); },
  isPinchtabRunning: () => Boolean(pinchtabProcess && !pinchtabProcess.killed),

  // Tab management
  listPinchtabTabs,
  pickBestPinchtabTabId,
  resolvePinchtabTabState,

  // Actions
  runPinchtabAction,
  evaluatePinchtabExpression,
  findPinchtabRef,
  killPinchtabListenerProcess,
  focusPinchtabChromeWindow,
  performBrowserAction,

  // Canvas
  createPinchtabHeaders,
  resolveBrowserCanvasContent,

  // Utilities
  normalizeBrowserUrl,
  buildBrowserTitleFromUrl,
  normalizeCanvasLayout,
  parsePinchtabSnapshotText,
  trimBrowserText,
  getActiveBrowserSnapshotItem,
  getBrowserSnapshotItemByRef,
  getBrowserTabId,
  extractSnapshotItemLabelText,
  extractSnapshotItemValue,
  isTextInputFallbackCandidate,
  isClickFallbackCandidate,
  sanitizeBrowserActionText,
  getBrowserComparableState,
  didBrowserStateChange,
  didBrowserClickProgress,
  isPinchtabRecoverableActionError,
  isPinchtabRouteNotFoundError,
  isYouTubeSearchRef,
  buildYouTubeSearchUrl,
  summarizeBrowserDirective,
  summarizeBrowserReason,
  isBrowserAutopilotTerminalResponse,
  sleep,
};
