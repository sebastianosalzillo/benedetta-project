<!-- OMX:RUNTIME:START -->
<session_context>
**Session:** omx-1775210885182-3hr5x1 | 2026-04-03T10:08:05.346Z

**Codebase Map:**
  scripts/: measure_kokoro_latency
  electron/: acp-runtime, apply-patch, browser-agent, circuit-breaker, computer-control, constants, dream-mode, file-tool, frustration-detector, git-tool
  public/: dynamicbones, lipsync-de, lipsync-en, lipsync-fi, lipsync-fr, lipsync-lt, playback-worklet, retargeter, talkinghead, siteconfig
  (root): test_acp, vite.config

**Explore Command Preference:** enabled via `USE_OMX_EXPLORE_CMD` (default-on; opt out with `0`, `false`, `no`, or `off`)
- Advisory steering only: agents SHOULD treat `omx explore` as the default first stop for direct inspection and SHOULD reserve `omx sparkshell` for qualifying read-only shell-native tasks.
- For simple file/symbol lookups, use `omx explore` FIRST before attempting full code analysis.
- When the user asks for a simple read-only exploration task (file/symbol/pattern/relationship lookup), strongly prefer `omx explore` as the default surface.
- Explore examples: `omx explore...

**Compaction Protocol:**
Before context compaction, preserve critical state:
1. Write progress checkpoint via state_write MCP tool
2. Save key decisions to notepad via notepad_write_working
3. If context is >80% full, proactively checkpoint state
</session_context>
<!-- OMX:RUNTIME:END -->
