# PRD — review-improve-loop

## Goal
Run a focused Ralph review/improvement cycle on the Avatar ACP Desktop repo and land one small, high-signal, low-risk improvement batch with verification evidence.

## Constraints
- Respect existing uncommitted changes.
- No new dependencies.
- Prefer safe renderer-side improvements over risky main-process refactors.
- Keep changes reviewable and reversible.

## Selected batch scope
1. Improve renderer accessibility semantics in chat/settings UI.
2. Add reduced-motion support in CSS for existing motion-heavy UI.
3. Refresh review notes if findings change materially.

## Non-goals for this batch
- Full `main.js` decomposition.
- Browser-agent migration completion (T003a).
- Large IPC validation rollout across the main process.

## Acceptance criteria
- Chat/settings UI exposes clearer labels/roles for assistive tech.
- Reduced-motion fallback exists for animated UI elements.
- `npm run build` passes.
- `npm run test:unit` passes.
- Any touched files remain consistent with existing style/patterns.
