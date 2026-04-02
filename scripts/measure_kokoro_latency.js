const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { TtsService } = require('../electron/tts-service');
const {
  KOKORO_PORT,
  KOKORO_URL,
  KOKORO_DEFAULT_SPEAKER,
  KOKORO_PYTHON,
  KOKORO_SERVER_SCRIPT,
  KOKORO_STARTUP_TIMEOUT_MS,
} = require('../electron/constants');

const execFileAsync = promisify(execFile);

async function stopExistingKokoroOnPort() {
  if (process.platform !== 'win32') return { stopped: false, reason: 'non-windows' };

  const script = `
$conn = Get-NetTCPConnection -LocalPort ${Number(KOKORO_PORT)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) { exit 0 }
$proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($conn.OwningProcess)" -ErrorAction SilentlyContinue
if (-not $proc) { exit 0 }
if ($proc.CommandLine -and $proc.CommandLine -like "*kokoro_tts_server.py*") {
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
  Write-Output $proc.ProcessId
}
`;

  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      timeout: 15000,
      cwd: path.join(__dirname, '..'),
    });
    const pid = String(stdout || '').trim();
    return pid ? { stopped: true, pid } : { stopped: false, reason: 'not-running-or-not-kokoro' };
  } catch (error) {
    return { stopped: false, reason: error.message || String(error) };
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function measureKokoro() {
  const restartInfo = await stopExistingKokoroOnPort();
  await sleep(400);

  const tts = new TtsService({
    url: KOKORO_URL,
    port: KOKORO_PORT,
    speaker: KOKORO_DEFAULT_SPEAKER,
    python: KOKORO_PYTHON,
    script: KOKORO_SERVER_SCRIPT,
    startupTimeout: KOKORO_STARTUP_TIMEOUT_MS,
  });

  const firstText = 'Questo e un benchmark di avvio Kokoro.';
  const secondText = 'Questa e la seconda sintesi a caldo.';

  const startedAt = Date.now();
  await tts.ensure();
  const startupMs = Date.now() - startedAt;

  const warmEnsureStartedAt = Date.now();
  await tts.ensure();
  const warmEnsureMs = Date.now() - warmEnsureStartedAt;

  tts.clearCache();

  const firstStartedAt = Date.now();
  await tts.synthesize(firstText);
  const firstSynthesisMs = Date.now() - firstStartedAt;

  const secondStartedAt = Date.now();
  await tts.synthesize(secondText);
  const secondSynthesisMs = Date.now() - secondStartedAt;

  const result = {
    restartedExistingServer: restartInfo,
    startupMs,
    warmEnsureMs,
    firstSynthesisMs,
    secondSynthesisMs,
    reportedLatencyMs: tts.latencyMs,
    speaker: KOKORO_DEFAULT_SPEAKER,
    url: KOKORO_URL,
  };

  tts.stop();
  return result;
}

(async () => {
  try {
    const result = await measureKokoro();
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
})();
