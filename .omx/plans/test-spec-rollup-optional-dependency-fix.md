# Test Spec: Rollup Optional Dependency Fix

## Primary Verification
1. Reproduce failure with `npm run dev:vite`.
2. Repair the dependency installation.
3. Re-run `npm run dev:vite` and confirm Vite starts.

## Regression Verification
1. Run `npm run build`.
2. Run `npm test`.
3. Run diagnostics on affected files if code changes are introduced.

## Review Cycles
1. Cycle 1: verify root cause and apply minimal install repair.
2. Cycle 2: re-run startup/build/tests and fix any newly exposed issue.
3. Cycle 3: run architect review, address findings if any, then repeat regression verification.

## Success Criteria
- Zero reproduction of the Rollup native module error after repair.
- Build and test commands complete successfully.
- No unresolved architect findings remain at completion.
