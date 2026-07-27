---
id: B-043
title: small cleanups from the 2026-07 implementation audit
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 9b0035cc-2974-4eac-a0fe-0fe68c60fd0a
---

## Problem
Assorted small defects found in the 2026-07 full-implementation audit. None is worth a standalone card; together they cost readers time and one is a user-visible inconsistency. Follow-up to B-023 (all of whose shim/duplication items are now done except the debounce issue extracted to [[B-039]]).

## Items
- **React action runner removal**: [[F-010c]] moves action orchestration to Electron. Delete `app/src/services/action_runner.ts` and its dead type branch after all verified call sites use the Electron runner; do not preserve a compatibility shim.
- **`window.confirm` for card deletion**: `ProjectCardView.deleteCard` (`app/src/components/card_view/project_card_view.tsx`) uses the native confirm while every other confirmation uses MUI dialogs; it is unstylable, blocks the renderer, and looks foreign in Electron. Replace with a small confirm `Dialog` (shared component if the release/branch dialogs don't already have one to reuse).
- **Config draft-discard timeout hack**: `ConfigPage` (`app/src/components/config/config_page.tsx`) discards the draft in a `setTimeout(…, DRAFT_DISCARD_DELAY_MS /* = 0 */)` from the effect cleanup to survive StrictMode double-mounts. Works, but the reason is invisible. Either replace with an explicit mount-count/ref guard or keep the timeout and add a comment stating the StrictMode constraint it works around, plus a test that the draft survives a remount and is discarded on real unmount.

## acceptance criteria
- All three items addressed; typecheck, lint and both test suites stay green.
- Card deletion shows an in-app dialog and still deletes/aborts correctly (component test updated).
- No React action runner or unreachable legacy type branch remains.

## see also
- `design\feature_descriptions\B_023_dead_code_cleanup.md`
- `design\feature_descriptions\B_039_action_reload_debounce_single_path.md`
