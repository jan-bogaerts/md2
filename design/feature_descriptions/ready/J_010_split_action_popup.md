---
id: J-010
title: extract action popup schedule form and run history subcomponents
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Item 7 of J-002. Extract schedule and history presentation so the popup keeps ID-based related navigation, run/cancel controls, conversion, supported run-specific selection, and resize behavior.

Depends on: J-003 (unused `action_schedule_form.tsx`/`action_run_history.tsx`/`action_schedule_trigger.ts` duplicates deleted, component back at `action_popup.tsx`) — this task recreates those filenames by **moving** the inline implementations.

## implementation details
- `components/actions/action_schedule_form.tsx` — trigger picker + registration state; `createScheduleTrigger` moves next to it (`action_schedule_trigger.ts`), removing the popup's inline reimplementation.
- `components/actions/action_run_history.tsx` — history list rendering.
- Subcomponents are presentation-only (props in, callbacks out); service wiring stays in the popup.
- Two commits (schedule form + trigger helper, then run history); run `npm run typecheck` and the app test suite after each. No inline copies of the moved code may remain in the popup.

## acceptance criteria
- `action_popup.tsx` is under ~200 lines and does not define `createScheduleTrigger` or render schedule-form/history JSX inline.
- Both subcomponents can be rendered in a test without mounting the popup.
- Existing action-popup tests pass unmodified except for import paths; `npm run typecheck`, lint and the app test suite pass after every commit.

## see also
- `design\feature_descriptions\ready\J_002_refactor_large_modules.md`
- `design\feature_descriptions\J_003_refactor_cleanup_dead_files_and_shims.md`
