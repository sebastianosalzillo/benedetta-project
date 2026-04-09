# PRD — Broad dedup/refactor for a leaner, faster app

- Date: 2026-04-03
- Mode: ralplan consensus (deliberate)
- Source of truth: `.omx/specs/deep-interview-bottlenecks-malfunzionamenti-miglioramenti.md`
- Context snapshot: `.omx/context/bottlenecks-malfunzionamenti-miglioramenti-20260403T102620Z.md`

## Requirements Summary
The user wants a broad refactor/deduplication pass across the application codebase to make the app leaner and faster. External breaking changes are explicitly allowed for UX, IPC, and tool behavior if they materially reduce complexity. The first pass must exclude `build/`, `dist/`, asset/vendor content, and `public/talkinghead`.

Key grounded facts:
- `electron/main.js` is extremely large at **8843 lines**, despite a stated intent to move logic into extracted modules (`electron/main.js:11-25`).
- Desktop-control helpers are duplicated between `electron/main.js:2814-3021` and `electron/computer-control.js:53-260`.
- App/workspace/window helpers are duplicated between `electron/main.js:223-237,513-530,622`, `electron/workspace-manager.js:38-105,654-662`, and `electron/window-manager.js:35-50,139-220`.
- Browser and desktop automation each own their own lifecycle/recovery stacks (`electron/browser-agent.js:133-217,260-420`; `electron/computer-control.js:402-533`).
- The renderer and UI still use periodic polling (`src/App.jsx:159-225`; `electron/renderer-loop.js:29-79`).
- The preload bridge is broad and pass-through heavy (`electron/preload.js:23-76,97-240`), while main-process IPC registration is also broad (`electron/main.js:8601-8816`).
- Test coverage exists for browser/window/workspace/chat-stream behavior, but there is no direct `computer-control` test coverage in `__tests__/`.

## Acceptance Criteria
1. A written cleanup/refactor plan exists before code changes and is kept current through execution.
2. At least three duplicate-helper clusters are removed or consolidated behind shared modules/interfaces, including:
   - PowerShell/desktop-control utilities
   - file/path/json/text helper layer
   - session/bootstrap/default-state helpers
3. The duplicate definitions currently present in `electron/main.js:223-237,513-530,622,2814-3021` no longer remain duplicated in both `main.js` and the owning modules after the selected slice lands.
4. `electron/main.js` is reduced from “owner of logic + wiring” to primarily orchestration/IPC composition, with at least one named logic cluster relocated or deleted and the remaining ownership documented.
5. At least two periodic or lifecycle hotspots are either:
   - removed/replaced with event-driven or readiness-based flow, or
   - explicitly retained with measured justification.
6. Browser/computer tooling lifecycle management is simplified so startup/recovery logic is more centralized and easier to reason about.
7. A preload/main contract map exists for every touched IPC surface, and no touched renderer callsite depends on orphaned or duplicate bridge methods after the slice.
8. A direct automated test suite or focused helper test coverage exists for at least one `computer-control` extraction target, closing the current gap called out by the repository scan.
9. Verification evidence exists for:
   - no new obvious regressions in covered modules,
   - targeted tests added around extracted shared logic,
   - measured before/after observations for startup/tool flows or an explicit explanation where measurement is blocked.

## RALPLAN-DR Summary

### Principles
1. **Delete duplication before adding abstraction.** Prefer removing repeated logic over wrapping it in extra layers.
2. **Make `main.js` a coordinator, not a warehouse.** Main process should compose modules and own IPC registration, not re-implement domain logic.
3. **Replace blind polling with explicit readiness.** Prefer event-driven or health/readiness flows over repeated timers and opaque waits.
4. **Refactor behind tests where behavior matters.** Stabilize critical current behavior before structural changes.
5. **Use broad scope deliberately, not indiscriminately.** Touch many files only when each edit clearly contributes to deduplication, bottleneck removal, or architectural cleanup.

### Decision Drivers
1. **Structural duplication is already confirmed** across desktop-control and file/state helper layers.
2. **Performance drag likely comes from lifecycle sprawl and polling**, not just isolated hot loops.
3. **Breaking changes are allowed**, so the plan can favor simpler boundaries over compatibility-preserving contortions.

### Viable Options
#### Option A — Incremental shared-utils consolidation
**Approach:** Extract common helpers first, then re-point current modules with minimal boundary changes.
- **Pros:** Lower immediate regression risk; fast wins on obvious duplication; easier to test in slices.
- **Cons:** Risks preserving poor architecture; `main.js` may stay oversized; may leave lifecycle ownership muddy.

#### Option B — Domain-boundary rewrite around thin main/preload layers
**Approach:** Recast the app around thinner orchestration layers and stronger feature ownership (workspace, browser, computer, window, state).
- **Pros:** Largest long-term simplification; best fit for allowed breaking changes; most likely to materially shrink `main.js`.
- **Cons:** Higher coordination cost; easier to overreach; demands stronger verification.

#### Option C — Hybrid staged rewrite (**recommended**)
**Approach:** Start with extraction of shared foundations and duplicate clusters, then use those extractions to shrink `main.js`, simplify lifecycle managers, and rationalize preload/API surfaces.
- **Pros:** Captures architectural gains without all-at-once rewrite risk; aligns with existing partial modularization (`electron/main.js:11-25`); keeps verification incremental.
- **Cons:** Requires discipline to avoid stalling after only helper extraction; may still span many files.

### Pre-mortem
1. **Failure: “Refactor cleaned code but not behavior.”**
   - Cause: broad edits without baseline or regression tests.
   - Mitigation: freeze critical behavior with targeted tests before moving logic.
2. **Failure: “Main.js got thinner on paper but complexity just moved sideways.”**
   - Cause: dumping utilities into generic helper files without ownership boundaries.
   - Mitigation: extract by domain responsibility, not by arbitrary helper type alone.
3. **Failure: “Performance claims are anecdotal.”**
   - Cause: removing code without capturing startup/tool-action evidence.
   - Mitigation: collect before/after timings or readiness observations for selected flows.

### Expanded Test Plan
- **Unit:** shared helper modules, normalization/path/file utilities, PowerShell wrapper behavior, state helper functions.
- **Integration:** browser-agent lifecycle, computer-control startup/readiness wrappers, workspace/window persistence paths, main↔module contracts.
- **E2E/Smoke:** app boot, chat send/stop, browser navigate/action, computer-control basic readiness, selected window/workspace flows.
- **Observability:** temporary timing/log instrumentation around startup, service readiness, retry loops, and tool actions.

## Chosen Direction
Adopt **Option C (Hybrid staged rewrite)**. It best matches the repo’s current state: modules already exist but `main.js` still duplicates and re-owns too much logic. The plan should remove duplicate foundations first, then use those new boundaries to simplify orchestration, preload/API shape, and runtime waits.

## Phase Gates
### Gate A — Foundation ready
- Duplicate clusters selected for the slice are enumerated with owner modules.
- Baseline tests/measurements for selected flows are captured.
- Excluded paths are confirmed untouched.

### Gate B — Boundary shift allowed
- New/shared helper modules have direct tests.
- `main.js` delegates to the new owners for the selected cluster without shadow duplicate fallbacks.
- Any retained timer/retry loop in touched code has written justification.

### Gate C — Surface cleanup allowed
- Preload/main contract table is updated for touched features.
- Renderer callsites for touched IPC methods pass against the updated bridge.
- Manual/smoke verification exists for at least one browser and one computer flow if those areas were touched.

## Implementation Steps

### Step 1 — Establish baselines and map the refactor surface
**Why:** Broad refactor with breaking changes still needs evidence and a bounded attack plan.
**Files:**
- `.omx/specs/deep-interview-bottlenecks-malfunzionamenti-miglioramenti.md`
- `electron/main.js:11-25,8601-8816`
- `electron/preload.js:23-76,97-240`
- `src/App.jsx:159-225`
- `electron/renderer-loop.js:29-79`
- `__tests__/browser-agent.test.js`, `__tests__/window-manager.test.js`, `__tests__/workspace-manager.test.js`, `__tests__/chat-stream-state.test.js`
**Actions:**
- Inventory duplicate clusters and lifecycle hotspots.
- Pick baseline flows to measure: app startup, one browser-agent action, one computer-control readiness/action, one chat/status flow.
- Mark existing tests that already protect behavior vs uncovered critical areas.
- Produce a slice map that names which duplicate clusters will be addressed in the first execution pass and which are explicitly deferred.

### Step 2 — Lock critical current behavior with regression-focused tests
**Why:** Refactor breadth plus breaking-change permission does not remove the need to detect accidental damage in selected flows.
**Files:**
- existing `__tests__/*.test.js`
- add targeted tests for `electron/computer-control.js`, extracted shared helpers, and any newly isolated IPC mapping helpers
**Actions:**
- Add tests around the shared logic that will move first.
- Cover at least one desktop-control contract currently untested.
- Prefer tests around pure/shared logic rather than fragile full-Electron behavior.
- Do not start wide IPC or renderer rewiring until Gate A is satisfied.

### Step 3 — Consolidate duplicate helper foundations
**Why:** The codebase repeats utilities that should become single owners before higher-level cleanup.
**Files:**
- `electron/main.js:223-237,513-530,622,2814-3021`
- `electron/workspace-manager.js:38-105,654-662`
- `electron/window-manager.js:35-50,139-220`
- `electron/computer-control.js:29-126,203-260`
- `electron/browser-agent.js:37-54`
- `electron/tts-service.js:20-22`
**Actions:**
- Extract shared modules for:
  - text normalization/truncation,
  - app/userData path + json/text file helpers,
  - PowerShell execution/desktop-control helpers,
  - default session/state factory helpers where duplication is real.
- Remove duplicated definitions from consumers and standardize imports.
- Name the owner for each extracted module so the refactor does not devolve into a generic `utils` dump.

### Step 4 — Shrink `electron/main.js` into orchestration-only ownership
**Why:** `main.js` is currently both registry and domain-logic container.
**Files:**
- `electron/main.js` broadly, especially `11-25`, `223-237`, `513-530`, `2814-3021`, `8601-8816`
- companion modules under `electron/`
**Actions:**
- Move remaining inline domain logic into the owning modules.
- Replace ad hoc duplicated helpers with module calls.
- Normalize IPC registration so handlers delegate quickly to modules instead of embedding orchestration details.
- Keep a temporary ownership table for each extracted `main.js` cluster to prevent logic from simply moving sideways into another mega-module.

### Step 5 — Simplify browser/computer lifecycle and waiting models
**Why:** Browser/computer tooling carries both code duplication and performance risk through startup/recovery loops.
**Files:**
- `electron/browser-agent.js:133-217,260-420`
- `electron/computer-control.js:402-533`
- `electron/tts-service.js:83-221`
- `electron/renderer-loop.js:29-79`
- `src/App.jsx:221-225`
**Actions:**
- Replace fixed waits/polling where feasible with readiness/state-based flows.
- Align service lifecycle patterns across PinchTab, pywinauto-mcp, and TTS where duplication exists.
- Remove or justify periodic loops that only support derived UI state.
- Prefer state/actionability/readiness signals backed by the researched Electron/Playwright/pywinauto guidance instead of adding new fixed sleeps.

### Step 6 — Rationalize renderer/preload contracts
**Why:** A cleaner API surface reduces duplicate wiring and future maintenance cost.
**Files:**
- `electron/preload.js:23-76,97-240`
- `electron/main.js:8601-8816`
- `src/App.jsx`
- `src/components/AvatarChat.jsx`
- `src/components/CanvasWorkspace.jsx`
- `src/components/SettingsPanel.jsx`
**Actions:**
- Group or rename IPC surface areas around cleaner feature contracts.
- Remove pass-through duplication where renderer only mirrors main-process sprawl.
- Update renderer consumers to depend on the simplified surface.
- Only touch the contract slices already covered by Gate B tests; defer untouched feature families rather than rewriting the entire bridge at once.

### Step 7 — Verify, measure, and document residual risk
**Why:** The user asked for “snella e veloce,” so completion needs evidence.
**Files:**
- relevant `__tests__/`
- optional measurement script updates under `scripts/`
- PRD + test spec artifacts in `.omx/plans/`
**Actions:**
- Run unit/build/smoke checks selectively.
- Record before/after measurements or readiness observations for chosen flows.
- Document residual risk and deferred follow-ups instead of hand-waving remaining complexity.

## Concrete Verification Commands
Run these as applicable during execution:
- `npm run test:unit -- --runInBand`
- `npm run build`
- targeted `computer-control` suite for the extracted helpers/contracts
- `node test_acp.js` **only if** ACP/runtime code is touched

## Recommended First Execution Slice
To keep the broad refactor deliberate instead of opportunistic, the first execution slice should target this ordered cluster:
1. `electron/main.js` duplicated file/path/state helpers (`223-237`, `513-530`, `622`)
2. duplicated PowerShell/desktop-control helpers in `electron/main.js:2814-3021` and `electron/computer-control.js:53-260`
3. direct tests for the extracted `computer-control` shared layer
4. only then preload/IPC cleanup for the touched slice

This preserves the chosen hybrid strategy: remove the most obvious duplicate owners first, then change the public surface only where the extracted ownership already exists.

## Risks and Mitigations
- **Risk:** Broad refactor collides with existing dirty working tree.
  - **Mitigation:** isolate changed files intentionally; avoid touching excluded trees; stage work by ownership.
- **Risk:** The plan claims “broad” scope and then silently overreaches into every feature family.
  - **Mitigation:** use explicit phase gates and slice maps; defer non-selected clusters instead of opportunistic cleanup.
- **Risk:** Shared helper extraction becomes “misc utils” sprawl.
  - **Mitigation:** create modules by ownership boundary (desktop-control, file-store, state factories), not a generic dump.
- **Risk:** Performance effort devolves into micro-optimizing render details while lifecycle overhead remains.
  - **Mitigation:** baseline startup/tool flows first and prioritize waits/retries/pollers before cosmetic tuning.
- **Risk:** Breaking changes simplify internals but silently break renderer integration.
  - **Mitigation:** rationalize preload and IPC contracts together; verify consumers with targeted integration/smoke checks.

## Verification Steps
1. Run focused unit tests for changed helper modules and existing browser/window/workspace suites via `npm run test:unit -- --runInBand`.
2. Add and run tests for extracted `computer-control`/desktop-control shared logic, either in a new focused suite or as isolated helper coverage under `__tests__/`.
3. Run build verification on the application codebase after the structural cleanup via `npm run build`.
4. Exercise at least one browser-agent flow and one computer-control flow manually or via smoke harness.
5. Run `node test_acp.js` only if the selected slice touches ACP/runtime behavior.
6. Capture before/after measurements or logs for startup/readiness/tool-action loops.
7. Review diff for prohibited scope: no work in `build/`, `dist/`, asset/vendor, `public/talkinghead`.
8. Verify that no touched preload method lacks a matching `ipcMain` owner and no touched renderer callsite points at removed bridge names.

## ADR
### Decision
Use a **hybrid staged rewrite**: consolidate shared foundations first, then shrink main/preload orchestration and simplify lifecycle/polling behavior.

### Drivers
- Confirmed duplicate logic across multiple core Electron modules.
- Oversized `electron/main.js` is a structural bottleneck.
- Browser/computer service lifecycle and polling patterns are likely performance and maintenance hotspots.
- User accepts breaking external changes, enabling cleaner boundaries.

### Alternatives considered
- **Incremental shared-utils only:** too likely to preserve poor architecture.
- **Full domain-boundary rewrite immediately:** high payoff but too risky without staged verification.

### Why chosen
The hybrid approach preserves momentum on obvious duplication while still attacking the deeper source of complexity: the oversized main-process orchestration and fragmented service lifecycles.

### Consequences
- Many files may change across Electron main, preload, and renderer layers.
- Some external contracts may intentionally break and require coordinated renderer/main updates.
- Verification burden increases and must be planned, not deferred.

### Follow-ups
- Decide whether a later second pass should also rationalize docs/examples/vendor trees after the application code stabilizes.
- Consider adding sustained instrumentation for startup/service readiness if temporary measurements reveal repeated hotspots.

## Available-Agent-Types Roster
- `architect` — high-level boundary design, module ownership, ADR decisions
- `executor` — implementation/refactor lanes
- `test-engineer` — regression strategy and new test coverage
- `verifier` — completion evidence and selective validation
- `build-fixer` — build/type/test breakage cleanup if refactor destabilizes tooling
- `code-reviewer` / `critic` — plan or diff review before final merge

## Follow-up Staffing Guidance
### If using `$ralph`
- **Owner:** 1 `executor` lane at **high** reasoning
- **Embedded support checkpoints:**
  - `architect` at **high** reasoning for boundary decisions before major extraction
  - `test-engineer` at **medium** reasoning before and after helper consolidation
  - `verifier` at **high** reasoning before completion claim
- **Why:** This is suitable if one persistent owner should drive the broad refactor sequentially while consulting specialists at clear checkpoints.

### If using `$team`
- **Lane 1:** `architect` (**high**) — define target boundaries, shared module ownership, ADR updates
- **Lane 2:** `executor` (**high**) — helper extraction + main.js slimming
- **Lane 3:** `executor` (**high**) — preload/renderer contract cleanup
- **Lane 4:** `test-engineer` (**medium**) — regression harness, new focused tests, verification scripts
- **Lane 5 (optional):** `verifier` (**high**) — independent evidence pass before shutdown
- **Why:** This is suitable if you want parallel progress on disjoint write scopes: core Electron internals, renderer contract updates, and verification.

## Launch Hints
### Ralph path
- `$ralph .omx/plans/prd-bottlenecks-malfunzionamenti-miglioramenti.md`

### Team path
- `$team .omx/plans/prd-bottlenecks-malfunzionamenti-miglioramenti.md`
- or `omx team ".omx/plans/prd-bottlenecks-malfunzionamenti-miglioramenti.md"`

## Team Verification Path
Before a `$team` handoff is considered complete:
1. Architect lane confirms final ownership map and deleted duplicate clusters.
2. Executor lanes prove changed files stay outside excluded trees.
3. Test lane runs targeted regression coverage and records gaps.
4. Verifier lane confirms acceptance criteria evidence and identifies residual risk.
5. If desired after team completion, Ralph can do a final sequential polish/verification pass against this PRD.

## Applied Improvements Changelog
- Added explicit deliberate-mode pre-mortem and expanded test plan.
- Strengthened file grounding with concrete line references.
- Added staffing/launch guidance for both `$ralph` and `$team` follow-up paths.
- Added phase gates to keep broad refactor work sequenced and reviewable.
- Added explicit first-slice ordering and concrete verification commands, including `preload ↔ ipcMain ↔ renderer` checks.
- Added phase gates, stronger acceptance criteria for duplicate-cluster removal, and preload/main contract verification requirements.
