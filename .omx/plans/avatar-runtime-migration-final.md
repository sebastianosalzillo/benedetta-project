# Avatar Runtime Architecture — Final Documentation

Status: **completed** (2026-04-04)
Migration: webview-based avatar → dedicated local renderer

---

## Final Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Electron App                       │
│                                                      │
│  ┌──────────────────┐      ┌──────────────────────┐  │
│  │   Chat Window    │      │   Avatar Window       │  │
│  │  (React + Vite)  │      │  (TalkingHead direct) │  │
│  │                  │      │                        │  │
│  │  AvatarChat.jsx  │      │  talkinghead/         │  │
│  │  SettingsPanel   │      │  index.html           │  │
│  │                  │      │  + vendor/ (local)    │  │
│  └───────┬──────────┘      └──────────┬───────────┘  │
│          │                             │              │
│          │  IPC: avatar:speak/stop/    │              │
│          │  set-mood/play-motion       │              │
│          ▼                             ▼              │
│  ┌───────────────────────────────────────────────┐   │
│  │            Main Process (main.js)              │   │
│  │                                                │   │
│  │  avatar-commands.js  ← typed handlers + valid  │   │
│  │  avatar-window-bridge.js ← preload for avatar  │   │
│  │  window-manager.js   ← createAvatarWindow()    │   │
│  │  register-safe-ipc.js ← IPC channel registry   │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Key Changes from Migration

| Before | After |
|--------|-------|
| `<webview>` in React component | Dedicated BrowserWindow |
| CDN dependencies (Three.js, DOMPurify, etc.) | Vendored in `public/talkinghead/vendor/` |
| Generic `avatar:command` IPC | 4 typed channels + validation |
| `webview.executeJavaScript()` | IPC → preload bridge → `window.head` |
| `webviewTag: true` | `webviewTag: false` |
| `will-attach-webview` handler | Removed entirely |
| Status bubble in React | Status bubble in preload bridge |

## Runtime Boundaries

### Avatar Window
- **Entry point**: `public/talkinghead/index.html` (loaded directly, not via React)
- **Preload**: `electron/avatar-window-bridge.js`
- **Security**: `contextIsolation: true`, `sandbox: false` (needs require for ipcRenderer), `nodeIntegration: false`, `webviewTag: false`
- **Loading**: `loadAvatarRenderer()` in `window-manager.js`
  - Dev: `http://localhost:5174/talkinghead/index.html`
  - Prod: `app://app/talkinghead/index.html`

### Chat Window
- **Entry point**: React app via Vite (`?screen=chat`)
- **Preload**: `electron/preload.js`
- **Security**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webviewTag: false`

### IPC Channels (Avatar)
| Channel | Direction | Purpose | Validation |
|---------|-----------|---------|------------|
| `avatar:speak` | renderer→main | Send speak command | text required, audioBase64, mood, expression |
| `avatar:stop` | renderer→main | Stop avatar activity | none needed |
| `avatar:set-mood` | renderer→main | Set mood/expression | mood or expression required, max 32 chars |
| `avatar:play-motion` | renderer→main | Play gesture/motion | motion name required, max 64 chars, validates type/hand/direction/duration |
| `avatar:command` | renderer→main | Legacy generic (during migration) | validates command name against allowed set |
| `avatar:playback` | renderer→main | Playback notification | requires requestId + segmentId |
| `avatar-command` | main→avatar window | Command dispatch to talkinghead | handled by bridge preload |
| `avatar-status` | main→chat/avatar window | Status updates | passthrough |

## Maintenance Rules

1. **Adding a new avatar command**: 
   - Add handler in `electron/avatar-commands.js` with validation
   - Add IPC channel in `electron/register-safe-ipc.js`
   - Add preload method in `electron/preload.js`
   - Add bridge handler in `electron/avatar-window-bridge.js`

2. **Updating TalkingHead dependencies**:
   - Install new version via npm
   - Copy to `public/talkinghead/vendor/` (run vendor copy script)
   - Update importmap in `public/talkinghead/index.html`
   - Verify build includes new vendor files

3. **Testing avatar changes**:
   - `npm run test:unit` — unit tests
   - `npm run test:e2e:avatar` — 10 avatar-specific E2E tests
   - `npm run test:e2e` — general E2E smoke

4. **Security considerations**:
   - Avatar window uses `sandbox: false` because the bridge needs `require('electron')` for ipcRenderer
   - This is acceptable because the window only loads local content (talkinghead/index.html)
   - No `nodeIntegration` — Node.js APIs not exposed to page scripts
   - CSP restricts script sources to `'self'` only (no CDN)

## File Map

| File | Role |
|------|------|
| `electron/avatar-commands.js` | Typed IPC handlers with validation |
| `electron/avatar-window-bridge.js` | Preload for avatar window — receives IPC, calls window.head |
| `electron/window-manager.js` | `createAvatarWindow()`, `loadAvatarRenderer()` |
| `electron/register-safe-ipc.js` | IPC channel registration |
| `electron/preload.js` | Preload for React windows (chat/canvas) |
| `src/avatar-runtime/adapter.js` | React-side adapter (no longer used for avatar window, kept for reference) |
| `src/components/NyxAvatar.jsx` | React component (now minimal — avatar window doesn't load React) |
| `public/talkinghead/index.html` | TalkingHead entry point with local importmap |
| `public/talkinghead/vendor/` | Vendored CDN dependencies |
| `e2e/avatar-regression.js` | 10 avatar-specific E2E tests |

## Stop Conditions — All Met ✅

- [x] A1 through A10 completed
- [x] No runtime `<webview>` remains for the avatar path
- [x] No runtime `executeJavaScript(...)` bridge for avatar control (in NyxAvatar.jsx)
- [x] Production avatar runtime does not depend on remote JS/CDN resources
- [x] `npm run test:unit` passes
- [x] `npm run build` passes
- [x] `npm run test:e2e` passes
- [x] `npm run test:e2e:avatar` passes (10/10)
