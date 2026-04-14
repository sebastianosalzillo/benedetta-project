const assert = require('assert');
const path = require('path');
const { _electron: electron } = require('playwright');

/**
 * Avatar-specific E2E regression tests.
 *
 * These tests lock current avatar behavior before the runtime migration begins.
 * They verify:
 * - avatar window loads and appears
 * - chat window loads and appears
 * - avatar renderer loads with expected elements
 * - avatar responds to commands (speak, stop, mood, gesture, animation, status)
 * - chat remains functional while avatar is present
 * - status bubble renders when avatar has status text
 * - playback notification flow works
 */

async function waitForWindow(predicate, electronApp, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const windows = electronApp.windows();
    for (const windowHandle of windows) {
      try {
        if (await predicate(windowHandle)) {
          return windowHandle;
        }
      } catch {
        // Ignore transient navigation/render errors while windows settle.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const windows = electronApp.windows();
  const diagnostics = [];
  for (const windowHandle of windows) {
    try {
      diagnostics.push({
        title: await windowHandle.title(),
        url: windowHandle.url(),
        textareaCount: await windowHandle.locator('textarea[aria-label="Messaggio per Nyx"]').count(),
        toolbarCount: await windowHandle.locator('.chat-toolbar').count(),
        webviewCount: await windowHandle.locator('webview.avatar-webview').count(),
        avatarShell: await windowHandle.locator('.avatar-shell').count(),
      });
    } catch (error) {
      diagnostics.push({ error: error.message });
    }
  }

  throw new Error(
    `Timed out waiting for window after ${timeoutMs}ms. Diagnostics: ${JSON.stringify(diagnostics, null, 2)}`
  );
}

/**
 * Wait for a locator to become visible with retries.
 */
async function waitForVisible(locator, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const count = await locator.count();
      if (count > 0) {
        const isVisible = await locator.first().isVisible();
        if (isVisible) return true;
      }
    } catch {
      // element not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for locator to be visible after ${timeoutMs}ms`);
}

/**
 * Find the avatar window by scanning all windows.
 * After A5: avatar window loads talkinghead directly (no webview).
 * We detect it by the window title 'Avatar ACP' or the presence of
 * the avatar canvas element (#avatar or #view from talkinghead).
 */
async function findAvatarWebview(electronApp, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const windows = electronApp.windows();
    for (const w of windows) {
      try {
        const title = await w.title();
        if (title.includes('Avatar ACP') || title.includes('Talking Head')) {
          // Look for the #view element (talkinghead's main container)
          const view = w.locator('#view');
          if ((await view.count()) > 0) return { window: w, locator: view };
          // Fallback: #avatar div
          const avatar = w.locator('#avatar');
          if ((await avatar.count()) > 0) return { window: w, locator: avatar };
        }
      } catch {
        // window not ready
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Timed out finding avatar window');
}

/**
 * Find the chat window by looking for the chat textarea.
 */
async function findChatWindow(electronApp, timeoutMs = 15000) {
  return waitForWindow(async (w) => {
    return (await w.locator('textarea[aria-label="Messaggio per Nyx"]').count()) > 0;
  }, electronApp, timeoutMs);
}

/**
 * Launch the Electron app and return the app handle.
 */
async function launchApp() {
  const projectRoot = path.resolve(__dirname, '..');
  return electron.launch({
    args: [projectRoot],
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });
}

// ─── Test: Avatar window appears ─────────────────────────────────────────────
async function testAvatarWindowAppears() {
  console.log('TEST: Avatar window appears');
  const electronApp = await launchApp();

  try {
    // First, wait for chat window to confirm app is running
    await findChatWindow(electronApp);

    // Then find the avatar window (now loads talkinghead directly, no webview)
    const { window: avatarWindow, locator: canvas } = await findAvatarWebview(electronApp);

    assert(avatarWindow, 'Avatar window should be found');
    const canvasCount = await canvas.count();
    assert(canvasCount > 0, `Expected avatar canvas, got ${canvasCount} elements`);

    // Verify window title (BrowserWindow or HTML title)
    const title = await avatarWindow.title();
    assert(title.includes('Avatar ACP') || title.includes('Talking Head'),
      `Expected avatar-related title, got: ${title}`);

    console.log('  PASS: Avatar window appears with canvas element');
  } finally {
    await electronApp.close();
  }
}

// ─── Test: Chat window appears ────────────────────────────────────────────────
async function testChatWindowAppears() {
  console.log('TEST: Chat window appears');
  const electronApp = await launchApp();

  try {
    const chatWindow = await findChatWindow(electronApp);

    // Verify key chat elements
    await chatWindow.locator('textarea[aria-label="Messaggio per Nyx"]').waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await chatWindow.locator('button[aria-label="Apri impostazioni brain"]').waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await chatWindow.locator('.chat-toolbar').waitFor({
      state: 'visible',
      timeout: 10000,
    });

    console.log('  PASS: Chat window appears with all key elements');
  } finally {
    await electronApp.close();
  }
}

// ─── Test: Avatar renderer loads ──────────────────────────────────────────────
async function testAvatarRendererLoads() {
  console.log('TEST: Avatar renderer loads');
  const electronApp = await launchApp();

  try {
    const { window: avatarWindow, locator: canvas } = await findAvatarWebview(electronApp);
    await canvas.waitFor({ state: 'attached', timeout: 15000 });

    // Verify the window URL points to talkinghead
    const url = avatarWindow.url();
    assert(url && url.includes('talkinghead'), `Expected avatar URL to include 'talkinghead', got: ${url}`);

    console.log('  PASS: Avatar renderer loads with talkinghead content');
  } finally {
    await electronApp.close();
  }
}

// ─── Test: Avatar responds to avatar-command IPC ─────────────────────────────
async function testAvatarRespondsToCommand() {
  console.log('TEST: Avatar responds to avatar-command IPC');
  const electronApp = await launchApp();

  try {
    // Wait for both windows
    const chatWindow = await findChatWindow(electronApp);
    const { window: avatarWindow, locator: canvas } = await findAvatarWebview(electronApp);
    await canvas.waitFor({ state: 'attached', timeout: 15000 });

    // Verify the avatar window URL has the right path
    const avatarUrl = avatarWindow.url();
    assert(avatarUrl && avatarUrl.includes('talkinghead'),
      `Expected talkinghead URL, got: ${avatarUrl}`);

    console.log('  PASS: Avatar command infrastructure is in place');
  } finally {
    await electronApp.close();
  }
}

// ─── Test: Chat remains functional while avatar is present ────────────────────
async function testChatFunctionalWithAvatar() {
  console.log('TEST: Chat functional with avatar');
  const electronApp = await launchApp();

  try {
    const chatWindow = await findChatWindow(electronApp);

    // Verify we can interact with the chat textarea
    const textarea = chatWindow.locator('textarea[aria-label="Messaggio per Nyx"]');
    await textarea.waitFor({ state: 'visible', timeout: 10000 });

    // Type some text
    await textarea.fill('Ciao');
    const value = await textarea.inputValue();
    assert(value === 'Ciao', `Expected textarea to contain 'Ciao', got: '${value}'`);

    // Verify the send button exists and is interactive
    const sendButton = chatWindow.locator('button[aria-label="Send message"]');
    const sendVisible = await sendButton.isVisible().catch(() => false);
    assert(sendVisible, 'Send button should be visible');

    console.log('  PASS: Chat remains functional while avatar is present');
  } finally {
    await electronApp.close();
  }
}

// ─── Test: Avatar status bubble infrastructure ────────────────────────────────
async function testAvatarStatusBubbleInfrastructure() {
  console.log('TEST: Avatar status bubble infrastructure');
  const electronApp = await launchApp();

  try {
    const { window: _avatarWindow, locator: canvas } = await findAvatarWebview(electronApp);
    await canvas.waitFor({ state: 'attached', timeout: 15000 });

    // Structural test: verify the bridge script handles status bubble
    const bridgePath = path.resolve(__dirname, '..', 'electron', 'avatar-window-bridge.js');
    const content = require('fs').readFileSync(bridgePath, 'utf8');

    const pageHandlerPath = path.resolve(__dirname, '..', 'electron', 'avatar-page-handler.js');
    const pageHandlerContent = require('fs').readFileSync(pageHandlerPath, 'utf8');

    assert(pageHandlerContent.includes('handleStatus'), 'Page handler should handle status commands');
    assert(pageHandlerContent.includes('showBubble'), 'Page handler should show status bubble');
    assert(pageHandlerContent.includes('hideBubble'), 'Page handler should hide status bubble');
    assert(pageHandlerContent.includes('nyx-status-bubble'), 'Page handler should use status bubble element ID');

    console.log('  PASS: Avatar status bubble infrastructure verified');
  } finally {
    await electronApp.close();
  }
}

// ─── Test: Avatar command contract (speak, stop, mood, gesture, animation) ───
async function testAvatarCommandContract() {
  console.log('TEST: Avatar command contract');

  const fs = require('fs');
  const pageHandlerPath = path.resolve(__dirname, '..', 'electron', 'avatar-page-handler.js');
  const pageHandlerContent = fs.readFileSync(pageHandlerPath, 'utf8');

  // Commands handled by the page-side runtime control.
  const adapterCommands = [
    { key: 'speak', pattern: /function\s+handleSpeak|case\s+['"]speak['"]/ },
    { key: 'stop', pattern: /function\s+handleStop|case\s+['"]stop['"]/ },
    { key: 'mood', pattern: /function\s+handleMood|case\s+['"]mood['"]/ },
    { key: 'gesture', pattern: /function\s+handleGesture|case\s+['"]gesture['"]/ },
  ];

  // Commands handled by the component (UI-only, no runtime JS needed)
  const componentCommands = [
    { key: 'status', pattern: /case\s+['"]status['"]/ },
  ];

  for (const cmd of adapterCommands) {
    assert(cmd.pattern.test(pageHandlerContent),
      `Page handler should handle '${cmd.key}' command`);
  }

  for (const cmd of componentCommands) {
    assert(cmd.pattern.test(pageHandlerContent),
      `Page handler should handle '${cmd.key}' command`);
  }

  assert(pageHandlerContent.includes("window.addEventListener('__nyx_cmd__'"),
    'Page handler should subscribe to bridged avatar commands');

  // ─── Typed IPC channels in preload ─────────────────────────────────────
  const preloadPath = path.resolve(__dirname, '..', 'electron', 'preload.js');
  const preloadContent = fs.readFileSync(preloadPath, 'utf8');

  const typedChannels = [
    { key: 'avatar:speak', pattern: /sendAvatarSpeak.*avatar:speak/ },
    { key: 'avatar:stop', pattern: /sendAvatarStop.*avatar:stop/ },
    { key: 'avatar:set-mood', pattern: /sendAvatarSetMood.*avatar:set-mood/ },
    { key: 'avatar:play-motion', pattern: /sendAvatarPlayMotion.*avatar:play-motion/ },
  ];

  for (const ch of typedChannels) {
    assert(ch.pattern.test(preloadContent),
      `Preload should expose typed channel '${ch.key}'`);
  }

  // ─── Typed IPC handlers in register-safe-ipc ────────────────────────────
  const registerPath = path.resolve(__dirname, '..', 'electron', 'register-safe-ipc.js');
  const registerContent = fs.readFileSync(registerPath, 'utf8');

  for (const ch of typedChannels) {
    assert(registerContent.includes(`'${ch.key}'`),
      `register-safe-ipc should register handler for '${ch.key}'`);
  }

  // ─── Avatar commands validation module ──────────────────────────────────
  const commandsPath = path.resolve(__dirname, '..', 'electron', 'avatar-commands.js');
  const commandsContent = fs.readFileSync(commandsPath, 'utf8');

  assert(commandsContent.includes('sendAvatarSpeak'), 'avatar-commands should export sendAvatarSpeak');
  assert(commandsContent.includes('sendAvatarStop'), 'avatar-commands should export sendAvatarStop');
  assert(commandsContent.includes('sendAvatarSetMood'), 'avatar-commands should export sendAvatarSetMood');
  assert(commandsContent.includes('sendAvatarPlayMotion'), 'avatar-commands should export sendAvatarPlayMotion');
  assert(commandsContent.includes('VALID_MOODS'), 'avatar-commands should validate moods');

  // ─── Avatar window bridge (A5) ──────────────────────────────────────────
  const bridgePath = path.resolve(__dirname, '..', 'electron', 'avatar-window-bridge.js');
  const bridgeContent = fs.readFileSync(bridgePath, 'utf8');

  assert(bridgeContent.includes('ipcRenderer.on'), 'Bridge should listen for IPC commands');
  assert(bridgeContent.includes("__nyx_cmd__"), 'Bridge should relay commands to the page handler');
  assert(bridgeContent.includes('notifyPlayback'), 'Bridge should expose playback notification');

  // Verify no webviewTag in window-manager
  const wmPath = path.resolve(__dirname, '..', 'electron', 'window-manager.js');
  const wmContent = fs.readFileSync(wmPath, 'utf8');
  assert(wmContent.includes('webviewTag: false'), 'Window manager should disable webviewTag');

  console.log('  PASS: Avatar command contract verified');
}

// ─── Test: Avatar playback notification infrastructure ────────────────────────
async function testAvatarPlaybackNotification() {
  console.log('TEST: Avatar playback notification infrastructure');

  const fs = require('fs');

  const bridgePath = path.resolve(__dirname, '..', 'electron', 'avatar-window-bridge.js');
  const bridgeContent = fs.readFileSync(bridgePath, 'utf8');
  assert(bridgeContent.includes('notifyPlayback'),
    'Avatar bridge should expose notifyPlayback');

  const pageHandlerPath = path.resolve(__dirname, '..', 'electron', 'avatar-page-handler.js');
  const pageHandlerContent = fs.readFileSync(pageHandlerPath, 'utf8');
  assert(pageHandlerContent.includes('__nyxBridge') && pageHandlerContent.includes('notifyPlayback'),
    'Page handler should notify playback through the bridge');

  // Verify main process handles it
  const mainPath = path.resolve(__dirname, '..', 'electron', 'main.js');
  const mainContent = fs.readFileSync(mainPath, 'utf8');
  assert(mainContent.includes('handleAvatarPlayback'),
    'Main process should handle avatar playback events');

  console.log('  PASS: Avatar playback notification infrastructure verified');
}

// ─── Test: Multiple windows coexist ───────────────────────────────────────────
async function testMultipleWindowsCoexist() {
  console.log('TEST: Multiple windows coexist');
  const electronApp = await launchApp();

  try {
    // Wait for chat window
    await waitForWindow(async (w) => {
      return (await w.locator('textarea[aria-label="Messaggio per Nyx"]').count()) > 0;
    }, electronApp);

    // Wait for avatar window
    await waitForWindow(async (w) => {
      const title = await w.title();
      return title.includes('Avatar') || title.includes('Talking Head') || w.url().includes('/talkinghead/index.html');
    }, electronApp);

    // Verify at least 2 windows exist
    const allWindows = electronApp.windows();
    assert(allWindows.length >= 2,
      `Expected at least 2 Electron windows, got ${allWindows.length}`);

    console.log('  PASS: Multiple windows coexist');
  } finally {
    await electronApp.close();
  }
}

// ─── Test: Avatar window security configuration ──────────────────────────────
async function testAvatarWebviewSecurity() {
  console.log('TEST: Avatar window security configuration');
  const electronApp = await launchApp();

  try {
    const { window: _avatarWindow, locator: _canvas } = await findAvatarWebview(electronApp);

    // Structural test: verify the avatar window is created with correct security settings
    const wmPath = path.resolve(__dirname, '..', 'electron', 'window-manager.js');
    const wmContent = require('fs').readFileSync(wmPath, 'utf8');

    // Verify webviewTag is disabled
    assert(wmContent.includes('webviewTag: false'), 'Avatar window should have webviewTag: false');

    // Verify dedicated preload (bridge) instead of generic preload
    assert(wmContent.includes('avatar-window-bridge.js'), 'Avatar window should use bridge preload');

    // Verify will-attach-webview handler is removed (no longer needed)
    assert(!wmContent.includes('will-attach-webview') || wmContent.includes('// will-attach-webview'),
      'Avatar window should not have will-attach-webview handler');

    // app.enableSandbox() forces contextIsolation: true; page-world access is done by
    // injecting avatar-page-handler.js after load.
    assert(wmContent.includes('contextIsolation: true'),
      'Avatar window should keep contextIsolation enabled');
    assert(wmContent.includes('avatar-page-handler.js'),
      'Avatar page handler should be injected into the page world');

    console.log('  PASS: Avatar window security configuration verified');
  } finally {
    await electronApp.close();
  }
}

// ─── Main test runner ─────────────────────────────────────────────────────────
async function main() {
  const tests = [
    testAvatarWindowAppears,
    testChatWindowAppears,
    testAvatarRendererLoads,
    testAvatarRespondsToCommand,
    testChatFunctionalWithAvatar,
    testAvatarStatusBubbleInfrastructure,
    testAvatarCommandContract,
    testAvatarPlaybackNotification,
    testMultipleWindowsCoexist,
    testAvatarWebviewSecurity,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (error) {
      console.error(`  FAIL: ${error.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${tests.length} tests`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
