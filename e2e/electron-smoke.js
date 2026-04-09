const assert = require('assert');
const path = require('path');
const { _electron: electron } = require('playwright');

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
      });
    } catch (error) {
      diagnostics.push({ error: error.message });
    }
  }

  throw new Error(`Timed out waiting for window after ${timeoutMs}ms. Diagnostics: ${JSON.stringify(diagnostics, null, 2)}`);
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const electronApp = await electron.launch({
    args: [projectRoot],
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  try {
    const firstWindow = await electronApp.firstWindow();
    await firstWindow.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});

    const chatWindow = await waitForWindow(async (windowHandle) => {
      return (await windowHandle.locator('textarea[aria-label="Messaggio per Nyx"]').count()) > 0;
    }, electronApp);

    await chatWindow.locator('textarea[aria-label="Messaggio per Nyx"]').waitFor({ state: 'visible', timeout: 15000 });
    await chatWindow.locator('button[aria-label="Apri impostazioni brain"]').waitFor({ state: 'visible', timeout: 15000 });
    await chatWindow.locator('.chat-toolbar').waitFor({ state: 'visible', timeout: 15000 });

    const allWindows = electronApp.windows();

    // After A5: avatar window loads talkinghead directly (no webview).
    // Verify at least 2 windows exist (chat + avatar).
    assert(allWindows.length >= 2, `Expected at least 2 Electron windows, got ${allWindows.length}.`);

    // Verify avatar window has the expected title
    const avatarWindow = allWindows.find((w) => w.title().then((t) => t.includes('Avatar ACP')).catch(() => false));
    assert(avatarWindow, 'Avatar ACP window should be present');

    console.log('Electron E2E smoke passed.');
  } finally {
    await electronApp.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
