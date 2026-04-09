# Test Spec — Broad dedup/refactor for a leaner, faster app

- Date: 2026-04-03
- Linked PRD: `.omx/plans/prd-bottlenecks-malfunzionamenti-miglioramenti.md`
- Scope exclusions: `build/`, `dist/`, asset/vendor, `public/talkinghead`

## Test Objectives
1. Detect regressions introduced by broad helper extraction and boundary changes.
2. Verify that browser/computer lifecycle changes reduce fragility rather than just moving code around.
3. Support performance claims with concrete before/after observations on selected flows.

## Baseline Measurements
Capture before any structural change:
- App boot time to first stable app state response (`app:get-state` path)
- Browser-agent readiness/navigate/action timing for one representative flow
- Computer-control readiness timing (`ensurePywinautoMcpService`) and one representative action
- Count/location of fixed timers or polling loops retained vs removed in touched code
- Snapshot of touched preload bridge methods and their corresponding `ipcMain` owners for the selected slice

## Unit Test Scope
### Existing suites to preserve
- `__tests__/browser-agent.test.js`
- `__tests__/chat-stream-state.test.js`
- `__tests__/window-manager.test.js`
- `__tests__/workspace-manager.test.js`

### New/expanded suites required
1. **Desktop-control shared helpers**
   - PowerShell encoding/decoding wrapper
   - JSON process-output parsing
   - readiness/wait utilities where extracted
2. **Shared file/state helper layer**
   - path resolution
   - json/text read-write helpers
   - default state/session factory behavior
3. **IPC mapping helpers** (if extracted)
   - handler registration tables or dispatch mapping behavior

## Integration Test Scope
1. `electron/main.js` delegates correctly to extracted modules without inline duplicate fallback behavior.
2. `electron/preload.js` surface remains coherent with `ipcMain.handle` registrations after rationalization.
3. Browser-agent lifecycle: startup, refresh/action fallback behavior, cleanup flow.
4. Computer-control lifecycle: service boot/readiness, failure surfacing, selected action wrapper path.
5. Workspace/window persistence flows still read/write expected state after helper extraction.
6. If renderer bridge names change, touched renderer consumers still resolve the renamed methods end-to-end.

## E2E / Smoke Scope
Run selectively after meaningful milestones:
1. App boot and `app:get-state`
2. Chat send/stop happy path
3. Browser navigate + one action
4. Computer-control readiness + one action or state refresh
5. Canvas/workspace path only if touched by the refactor slice
6. `node test_acp.js` only if the refactor slice touches ACP/runtime behavior

## Suggested Verification Commands
- `npm run test:unit -- --runInBand`
- `npm run build`
- `npx jest __tests__/browser-agent.test.js __tests__/window-manager.test.js __tests__/workspace-manager.test.js __tests__/chat-stream-state.test.js --runInBand`
- add and run a focused `__tests__/computer-control.test.js` (or equivalent extracted-helper suite) once the first desktop-control extraction lands
- run `node test_acp.js` only if the touched slice includes ACP/runtime integration and required local services are available

## Observability / Instrumentation
Temporary instrumentation is acceptable during refactor if later removed or gated.
Capture:
- startup timestamps for service readiness
- retry loop counts and timeout reasons
- frequency of periodic timers in changed flows
- browser/computer action latency before/after major lifecycle simplification
- explicit record of which timers/retries were deleted, retained, or replaced by readiness signals

## Exit Criteria
The refactor slice is ready only if:
1. Targeted unit/integration tests for changed shared logic pass.
2. Existing preserved suites still pass or any failure is explicitly explained and resolved.
3. `npm run test:unit -- --runInBand` has been run for the changed slice, with failures fixed or explicitly deferred.
4. `npm run build` has been run for the changed slice, with failures fixed or explicitly deferred.
5. Baseline vs after measurements exist for the selected flows.
6. No files in excluded scope were changed intentionally.
7. Remaining risky areas are documented with concrete `Not-tested` gaps for execution handoff.
8. For any touched preload method, there is a verified matching `ipcMain` owner and at least one renderer callsite check.
9. If the slice touched browser/computer lifecycle code, one readiness/action flow per touched tool has an explicit before/after note.
10. At least one `computer-control` helper or contract extraction is covered by automated tests.

## Known Gaps to Watch
- There is currently no direct `computer-control` test suite in `__tests__/`; this is a priority gap.
- Broad IPC/preload cleanup can introduce silent contract mismatches if integration checks are skipped.
- Performance improvements may be overstated if only build/unit tests run without runtime readiness measurements.

## Contract verification emphasis
For any preload or IPC cleanup, verify the touched path across all three layers:
1. `electron/preload.js` bridge shape
2. matching `ipcMain.handle` / event registration in `electron/main.js`
3. renderer consumers in `src/App.jsx` or touched components
