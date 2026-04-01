# Avatar ACP Desktop - Project Status

Last updated: 2026-03-31
Status: In Progress
Owner: Codex + user

## Goal

Build a new desktop app in `C:\Users\salzi\Desktop\Nuova cartella` with:

- transparent avatar window
- separate chat/control window
- user chat to talk with the avatar
- TTS audio playback
- lip sync
- emotions, gestures, movements, full animations, facial expressions, reactive status
- ACP resident/subagent server as the avatar brain
- reusable parts copied only where they are already proven to work

## Source Projects

### 1. `C:\Users\salzi\Desktop\Nuova cartella (9)\agentos-desktop`

Use as source for:

- Electron shell and IPC patterns
- existing `NyxAvatar` bridge based on TalkingHead
- command contract for `speak`, `mood`, `gesture`, `status`
- existing movement and animation behavior already wired into `NyxAvatar`
- resident/subagent orchestration ideas
- lightweight desktop-first structure

Do not copy blindly:

- current `main.js` as-is
- workspace-specific paths
- Nyx/Ollama-specific prompts and storage
- AgentOS-specific HTTP endpoints

### 2. `C:\Users\salzi\Desktop\airi`

Use as source for:

- transparent desktop window strategy
- click-through behavior tied to real alpha output
- transparent desktop UX patterns
- click-through and alpha-hit-testing strategy
- desktop avatar interaction patterns only

Do not import as full base:

- AIRI is a large monorepo
- copying the whole stack would slow down the new app immediately
- we only need the rendering and interaction patterns, not the entire platform

## Architecture Decision

The new app will be a fresh Electron + React desktop app with a small codebase.

### Chosen direction

- Base app: new project in this folder
- Avatar runtime V1: reuse the working `NyxAvatar` bridge from `agentos-desktop`
- Transparency/click-through: adapt the AIRI desktop window pattern
- Brain: ACP resident server, not `nyx_brain.js`
- Chat: docked/floating React chat panel inside the desktop app
- TTS/lipsync/expressions: reuse the `NyxAvatar` path first, then adapt only where ACP integration requires it
- Motion layer: preserve the full `NyxAvatar` gesture, movement and animation behaviors in V1
- Emotion layer: map assistant output into `mood`, `gesture`, `expression`, `status`

### Why this is the right starting point

- It gets a working desktop avatar faster than porting AIRI rendering wholesale.
- It keeps the brain independent from the avatar runtime.
- It keeps avatar, TTS, lipsync and expressions on a stack that already works together.
- It preserves the avatar behaviors that make it feel alive instead of rebuilding motion logic from zero.
- It lets us swap renderer later if we decide to move from TalkingHead to VRM/Live2D.
- It avoids carrying old AgentOS coupling into the new project.

## Reuse Plan

### Copy first

- `agentos-desktop/src/components/NyxAvatar.jsx`
- `agentos-desktop/public/talkinghead/*` only if licensing and assets are acceptable
- safe Electron bootstrapping and IPC patterns from `agentos-desktop/electron/main.js`
- resident/worker orchestration semantics from `RESIDENT_ORCHESTRATION_CONTRACT.md`

### Adapt from AIRI

- transparent window config from `apps/stage-tamagotchi/src/main/windows/shared/window.ts`
- always-on-top panel window behavior from `apps/stage-tamagotchi/src/main/windows/main/index.ts`
- alpha-aware click-through logic from `apps/stage-tamagotchi/src/renderer/pages/index.vue`
- no AIRI avatar runtime reuse in V1

### Rewrite from scratch

- ACP brain adapter
- project-specific IPC names
- chat window UX
- avatar command bus
- speech provider abstraction
- emotion parser between ACP replies and avatar commands
- project status tracking and local persistence

## Target Modules

### 1. Electron shell

- transparent frameless avatar window
- separate chat/control window
- always-on-top support
- optional click-through when mouse is outside interactive UI
- secure preload bridge

### 2. Avatar runtime

- renderer host for the avatar
- transparent background
- base implementation: `NyxAvatar`
- command API:
  - `speak`
  - `setMood`
  - `playGesture`
  - `setExpression`
  - `setStatus`
- preserve complete movement/animation behavior from the source runtime

### 3. Chat UI

- dedicated chat window
- message history
- streaming assistant reply
- send button + enter to send
- status indicators: listening, thinking, speaking, error

### 4. ACP brain adapter

- connect to resident ACP service
- send user text
- receive response stream/events
- keep resident as the single decision-maker
- optional worker orchestration remains behind ACP, not in the UI

### 5. Speech pipeline

- keep the `NyxAvatar` speech path as the default implementation
- text -> TTS audio
- audio playback queue
- lip sync drive values through the current avatar runtime
- interrupt/cancel current playback on new user message
- keep avatar mouth/state reset stable when playback ends

### 6. Emotion and reaction layer

- convert ACP output into structured avatar actions
- maintain current mood/status
- support gesture + facial expression with cooldowns
- map ACP output specifically to the `NyxAvatar` command set
- preserve full-body/pose/movement animation triggers already supported by `NyxAvatar`
- inspect AIRI only as a secondary source for extra motion/emotion ideas that can be translated into the `NyxAvatar` runtime
- fall back to neutral safely

## Step-by-Step Implementation Plan

### Phase 0 - Project setup

Status: Completed

- create fresh Electron + React app scaffold in this folder
- define folder layout: `electron`, `src`, `public`, `docs`
- add `PROJECT_STATUS.md` as SSOT
- add basic npm scripts: `dev`, `build`, `package`

### Phase 1 - Transparent desktop shell

Status: Completed

- create frameless transparent main window
- wire preload bridge
- implement safe `windowOpenHandler`
- add always-on-top toggle
- verify transparent background on Windows

Deliverable:

- blank transparent app window starts reliably

### Phase 2 - Avatar host

Status: Completed

- port the existing `NyxAvatar` bridge
- load avatar inside renderer/webview safely
- expose avatar command bus from preload
- support V1 command surface: `speak`, `mood`, `gesture`, `status`, `expression`
- preserve existing gestures, movements and animation transitions already working in the source project
- verify crash recovery / reload handling

Deliverable:

- avatar loads, stays visible, accepts manual commands

### Phase 3 - Chat UI

Status: Completed

- add dedicated chat window
- render conversation thread
- support user input + message send
- support persistent history reload
- support streaming assistant reply
- support stop/interrompi current response
- show runtime state: idle, thinking, speaking, error

Deliverable:

- user can talk to avatar with text in-app

### Phase 4 - ACP brain integration

Status: Completed

- direct ACP adapter via `qwen.ps1 --channel ACP`
- support streaming preview in chat
- use structured ACP output for text, emotion, gesture, expression, intensity
- define normalized event format returned to UI

Proposed internal event shape:

```ts
type AvatarBrainEvent =
  | { type: 'status'; value: 'idle' | 'thinking' | 'speaking' | 'error' }
  | { type: 'text'; text: string }
  | { type: 'emotion'; mood?: string; gesture?: string; expression?: string }
  | { type: 'speech'; text: string; audioUrl?: string; audioBase64?: string }
```

Deliverable:

- user message reaches resident ACP and returns assistant text

### Phase 5 - TTS and lip sync

Status: Completed

- keep `NyxAvatar` TTS/lipsync path as baseline
- add a speech provider adapter only where needed for ACP output
- generate playable audio from assistant text
- queue/cancel playback correctly
- drive lipsync while audio is playing
- keep avatar mouth reset stable when playback ends

Deliverable:

- avatar speaks with synced mouth movement

### Phase 6 - Emotions, gestures, facial reactions

Status: Completed

- define emotion vocabulary
- map assistant reply metadata to `NyxAvatar` actions
- set mood/expression before playback
- trigger gestures with cooldowns
- support movement/animation triggers, not just face changes
- review AIRI motion/emotion mappings and borrow only what can be cleanly mapped onto `NyxAvatar`
- keep neutral fallback and error fallback

Deliverable:

- avatar visibly reacts, moves and animates, not just speaks

### Phase 7 - Polish and packaging

Status: Pending

- persist settings
- add startup defaults
- harden IPC
- package Windows build
- test idle/reconnect/reload cases

Deliverable:

- usable packaged desktop app

## Recommended Execution Order

1. Scaffold the new app.
2. Make transparency work.
3. Mount the avatar and prove manual command control.
4. Add the chat panel.
5. Connect ACP resident as brain.
6. Add TTS playback.
7. Reuse and stabilize `NyxAvatar` lipsync/TTS/expression flow.
8. Add ACP-driven emotions and gesture logic.
9. Package and harden.

## Current Status

### Completed today

- compared `agentos-desktop` and `airi`
- selected a pragmatic hybrid architecture
- decided against copying the full AIRI monorepo
- locked V1 avatar, TTS, lipsync and expressions to `NyxAvatar`
- locked V1 gestures, movements and full animations to the `NyxAvatar` runtime as well
- identified exact modules to copy, adapt, or rewrite
- created this status file as project SSOT
- scaffolded a new Electron + React project in this folder
- added a transparent Electron shell with preload bridge
- split the app into two Electron windows: avatar and chat
- fixed initial window layout so avatar and chat do not open overlapped
- forced chat window above the avatar window to keep it interactable and draggable
- centered the avatar window on screen and kept a dedicated drag handle
- added window bounds persistence for avatar and chat
- persisted monitor/display id and always-on-top state for both windows
- improved ACP -> NyxAvatar animation planning with normalized gestures, expressions and reset-to-idle behavior
- copied `public/talkinghead` assets into the new project
- ported a first `NyxAvatar` runtime stripped of excluded commands like `camera`, `director`, `scale`
- connected the app to direct ACP via `qwen.ps1 --channel ACP`
- replaced the default TTS with a local Kokoro service
- fixed the default Kokoro speaker to `if_sara`
- kept NyxAvatar as the playback and lipsync runtime while delegating synthesis to Kokoro
- left VibeVoice available only as an optional test-only provider via env
- added persistent local chat history
- added local Nyx conversational memory derived from recent history and user preferences
- added chat streaming preview and stop/interrompi support
- extended stop/interrompi to halt current TTS and lipsync playback too
- added always-on-top toggles for avatar and chat windows
- moved ACP output to AIRI-style inline ACT and DELAY tokens
- added ACT + DELAY parsing with speech/reasoning separation
- upgraded chat stream protocol to message/complete semantics
- added immediate thinking state before full assistant response
- added Electron renderer-loop utilities for safer window communication
- imported PersonaLive-style explicit stream states for runtime status
- imported PersonaLive-style throttled streaming updates for smoother chat rendering
- imported PersonaLive-style robust shutdown cleanup for active session teardown
- reduced default avatar gesturing so neutral replies no longer force `happy/thumbup`
- tightened ACP prompt to avoid repeated greetings, user-name repetition, and overly sweet tone
- fixed ACT motion handling so explicit `null` motion stays gesture-free instead of falling back to defaults
- changed non-ACT fallback styling to follow user intent more than assistant phrasing
- made ACT parsing tolerant to relaxed non-JSON syntax emitted by ACP
- exposed the real full avatar runtime set in the prompt:
  - moods: `neutral`, `happy`, `angry`, `sad`, `fear`, `disgust`, `love`, `sleep`
  - gesture: `handup`, `ok`, `index`, `thumbup`, `thumbdown`, `side`, `shrug`, `namaste`
  - poses: `straight`, `side`, `hip`, `turn`, `back`, `wide`, `oneknee`, `kneel`, `bend`, `sitting`, `dance`
  - animations: `walking`
- distinguished `gesture`, `pose`, and `animation` explicitly in ACP parsing and renderer dispatch
- upgraded chat debug meta to show `motion` and `motionType` instead of only a generic gesture field
- added a third Electron window `canvas` that Nyx can open, close, dock to the right, or switch to `split-50`
- added ACP `CANVAS` tokens so the brain can request side content during a reply
- hardened canvas behavior so explicit user requests still open a real canvas even if ACP forgets to emit `CANVAS`
- added few-shot ACP prompt examples for `canvas`, `split-50`, `clipboard`, `files`, and `video`
- replaced ACP launch path from the fragile PowerShell shim to direct `node + @qwen-code/qwen-code/cli.js`
- verified direct ACP calls with `--channel ACP` and multiline `-p` prompts work correctly on this machine
- added first canvas content types:
  - `text`
  - `clipboard`
  - `files`
  - `image`
  - `video`
  - `audio`
- added clipboard IPC via preload/main for interactive copy/paste inside the canvas
- verified `npm install`, `npm run build`, and Electron startup
- added ACP-guided workspace bootstrap with single-shot onboarding plus follow-up only for missing fields
- reset post-bootstrap ACP context so normal chat does not inherit onboarding text
- constrained the `Workspace / OpenClaw-style bootstrap` card to bootstrap-active or bootstrap-pending states only, so it disappears after bootstrap completion
- removed the visible fixed `8-step` browser-agent limit; the browser loop now continues until the brain decides to stop, with only a high internal safety guard against infinite loops
- added automatic PinchTab stale-ref recovery: if `/action` fails with `ref not found - take a /snapshot first`, the app refreshes the snapshot and lets the browser loop continue on the updated page state
- changed browser-agent loop semantics so intermediate progress phrases no longer end the task; only terminal responses stop the loop, and the agent must not ask the user to type `vai` or `continua` to keep going
- added first local `COMPUTER` ACP tool path for real Windows desktop actions outside PinchTab: `focus_window`, `mouse_move`, `mouse_click`, `type_text`, `hotkey`, and `screenshot`
- added `ACTIVE_COMPUTER` prompt context built from live Windows window enumeration plus screen and cursor info, so the ACP brain can target native desktop windows separately from the browser
- extended `COMPUTER` with `key_press`, `open_app`, `mouse_down`, and `mouse_up`, plus a minimal live desktop-status card in chat that shows focus, current computer action, last result, and screenshot path while the tool is acting
- aligned the internal memory model more closely with OpenClaw:
  - workspace markdown remains the stable identity layer
  - bootstrap writes back into workspace files
  - current session is now mirrored into a readable Markdown session record under `workspace/sessions`
  - ACP prompts now receive a dedicated `SESSION_CONTEXT` block in addition to workspace and memory recall
- migrated session persistence toward the workspace itself, with best-effort carry-over from legacy appdata session files
- upgraded daily memory flushes into more journal-like entries with summary, stable preferences, recent topics, and recent turns
- disabled live canvas in the active runtime path for now; browser, computer use, voice and avatar remain active
- added explicit ACP `WORKSPACE` updates for stable persistence into `USER.md`, `SOUL.md`, `IDENTITY.md`, `MEMORY.md` and `memory.md`, so the brain can write durable identity and preference changes in a controlled way

### Not started yet

- ACP client adapter
- full click-through transparency behavior
- resident/subagent HTTP orchestration adapter
- AIRI-inspired motion/emotion enrichment pass

## Risks

- ACP resident API contract may need normalization before the UI can consume it cleanly.
- `NyxAvatar` is the locked V1 runtime; richer facial control may later require VRM or Live2D.
- Transparent windows on Windows are easy to start and easy to regress; they need early validation.
- TTS provider choice changes both latency and lip sync quality.
- current direct ACP brain is not yet the resident HTTP orchestrator contract; it uses ACP channel directly.

## Open Decisions To Lock Early

- V1 TTS provider default locked to Kokoro; VibeVoice remains optional test-only.
- Resident ACP transport: HTTP, stdio bridge, or local websocket/event stream.

## Working State Right Now

- `npm install` completed successfully
- `npm run build` completed successfully
- `npm run start` launches Electron without immediate startup errors
- `qwen.ps1 --channel ACP` responds correctly in this environment
- warm Kokoro benchmark on this PC:
  - init about `1.7s`
  - first synthesis about `1.1s`
  - second synthesis about `80ms`
- avatar and chat now render as separate screens/windows
- renderer includes:
  - `NyxAvatar`
  - dedicated chat screen
  - local status badges
- main process currently uses:
  - direct ACP prompt execution via `qwen.ps1 --channel ACP`
  - local Kokoro HTTP TTS service with Italian voice `if_sara`
  - `avatar-command` event dispatch to the renderer
  - persistent window bounds under Electron user data

## Immediate Next Step

- measure first real in-app Kokoro latency after warmup and tune startup/warm text if needed
- keep VibeVoice isolated as a manual test path only

## Update Rule

This file must be updated whenever one of these changes:

- architecture decision
- completed phase
- blocker or risk
- implementation status
- chosen provider or protocol
