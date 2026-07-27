---
id: J-004
title: extract project toolbar menu dialogs into components
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 4853842f-cb89-4633-a5cb-539574addeeb
---

## Goal
Finish item 1 of J-002. The domain half is already done (`project_session_service.ts` + `use_project_session.ts` exist and the menu component makes zero direct data-service calls), but the component is still ~617 lines because the four dialogs were never extracted. Split the JSX so `project_toolbar_menu.tsx` keeps only the menu button, open-dialog state and composition. Pure refactor — **no behavior change**.

Depends on: J-003 (shims collapsed, file back at `app/src/components/shell/project_toolbar_menu.tsx`).

## implementation details
- Create sibling components under `app/src/components/shell/project/`:
  - `project_open_dialog.tsx` — repo/branch pickers + manual fallback + local/remote entry.
  - `working_folder_chooser_dialog.tsx` — missing-working-folder chooser flow.
  - `new_card_dialog.tsx` — type selector + title/body.
  - `complete_release_dialog.tsx` — release completion confirmation/inputs.
- Each dialog is presentation-only: props in (open flag, values, callbacks), no service imports; the session-service interaction stays in the menu component / `useProjectSession`.
- Move the dialog-specific local state (field values, validation messages) into the dialog components; the menu keeps only which-dialog-is-open.
- One dialog extraction per commit; run `npm run typecheck` and the app test suite after each.
- New files follow existing conventions: snake_case filenames, components own presentation only.

## acceptance criteria
- `project_toolbar_menu.tsx` is under 150 lines and contains no dialog JSX.
- The four dialog components exist under `components/shell/project/` and import no services.
- Existing menu/dialog tests pass unmodified except for import paths; each dialog can be rendered in a test without mounting the menu.
- `npm run typecheck`, lint and the app test suite pass after every commit.

## see also
- `design\feature_descriptions\ready\J_002_refactor_large_modules.md`
- `design\feature_descriptions\B_017_project_workspace_domain_logic.md`
- `design\feature_descriptions\J_003_refactor_cleanup_dead_files_and_shims.md`
