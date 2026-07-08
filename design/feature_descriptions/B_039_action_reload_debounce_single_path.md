---
id: B-039
title: action reload debounce remembers only the last changed path
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`ProjectLoading.scheduleActionReload` (`app/src/services/project_loading.ts`) stores a single `actionReloadChangedPath`. When two or more action definition files change within the 150 ms debounce window (a save-all in an editor, a git checkout, an agent writing several files), only the last path survives. `ActionService.reloadFromFiles` then attributes any validation error to that one path — "Action reload failed for X" — even when the invalid definition lives in one of the earlier files, sending the user to the wrong file. This was first noted in the B-023 audit list and extracted here.

Contrast: the markdown watch path already does this correctly with `markdownReloadEventsByPath: Map<string, ProjectWatchEvent>`.

## Fix
- Replace `actionReloadChangedPath: string | null` with a `Set<string>` of changed paths, accumulated across the debounce window and cleared when the reload runs.
- Pass the set to `actionService.reloadFromFiles`; change its error message to name all changed paths (or better: let `loadActionDefinitions` errors keep naming the offending file via the existing `source` argument, and report that).
- Keep the retain-previous-valid-set-on-failure behavior unchanged.

## acceptance criteria
- Two action files changed within one debounce window both take part in the reload, and a validation error names the file that actually contains the invalid definition (or lists all changed paths).
- Single-file changes behave as today.
- A test simulates two watch events inside the debounce window with an error in the first file and asserts the message points at it.

## see also
- `design\feature_descriptions\B_023_dead_code_cleanup.md`
- `design\feature_descriptions\ready\F_026_external_change_watching.md`
- `design\feature_descriptions\ready\F_010a_action_model_and_loading.md`
