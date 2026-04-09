# Test Spec — review-improve-loop

## Verification commands
1. `npm run build`
2. `npm run test:unit`

## File-level checks
- Review changed renderer files for valid JSX attributes and labels.
- Confirm reduced-motion CSS targets existing animated selectors without altering default behavior for non-reduced-motion users.

## Risks to watch
- JSX attribute mistakes (`htmlFor`, `aria-*`, role usage).
- CSS overrides accidentally disabling important layout/interaction states.
- Touching files that already have local modifications; inspect diff before/after.

## Done evidence
- Successful build output.
- Successful Jest output.
- Git diff limited to intended files.
