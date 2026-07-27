---
id: B-037
title: branch select renders an out-of-range value when branch listing fails
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 74b44f3f-000a-465c-bec3-82bdf84fb1fd
---

## Problem
When repository/branch listing fails and the manual fallback is used, the branch `Select` in the project open dialog (`app/src/components/shell/project/project_toolbar_menu_content.tsx`) can hold a value (e.g. `octo/demo` repo's branch) that is not among its (empty) options. MUI logs "You have provided an out-of-range value … The available values are ''" — visible in the test run for `ProjectWorkspace > keeps manual GitHub branch loading usable after repository listing fails` (`project_workspace.test.tsx`). Harmless at runtime today, but it means the select and its option list can disagree, and the warning noise hides real test regressions.

## Fix
- Keep the select's `value` consistent with its options: when the loaded branch list is empty (or doesn't contain the current value), either reset the value to `''`, include the current value as a synthetic option, or swap to the free-text branch input that the manual fallback already provides.
- Apply the same guard to the repository select if it can get into the same state.
- Assert on console warnings in the affected tests (fail on unexpected MUI warnings) so this class of mismatch resurfaces as a test failure.

## acceptance criteria
- Opening a project through the manual fallback produces no MUI out-of-range warnings.
- With an empty branch list, the branch control still lets the user type/choose a branch and open the project.
- The test suite runs without MUI select warnings in `project_workspace.test.tsx`.

## see also
- `design\feature_descriptions\ready\F_027_repository_branch_selection.md`
