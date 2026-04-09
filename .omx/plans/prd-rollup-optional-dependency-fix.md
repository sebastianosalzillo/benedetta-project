# PRD: Rollup Optional Dependency Fix

## Problem
On Windows, the development server fails before startup because Rollup cannot resolve the native package `@rollup/rollup-win32-x64-msvc`.

## Goal
Restore a working local install so Vite can boot and the app can be built and tested from this workspace.

## Scope
- Diagnose whether the failure is caused by lockfile metadata or an incomplete install.
- Repair the local dependency installation using the minimal safe change.
- Verify startup, build, and relevant automated checks.

## Non-Goals
- Refactor unrelated app code.
- Add new runtime dependencies to work around the installer.

## User Stories
1. As a developer on Windows, I can run `npm run dev:vite` without Rollup native module crashes.
2. As a maintainer, I have verification evidence showing the fix did not break build or tests.

## Acceptance Criteria
- `npm run dev:vite` reaches a healthy Vite startup state.
- `npm run build` succeeds.
- Relevant tests run successfully after the repair.
- Any file changes remain limited to the dependency repair workflow and required Ralph artifacts.
