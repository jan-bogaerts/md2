---
id: F-010a
title: action model and loading
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Define the action definition model and load action json files from the project's actions folder into a singleton app service exposed to React through a hook, failing fast on invalid definitions and circular calls. Foundation slice of `design\feature_descriptions\F_010_actions.md` — no UI and no execution yet.

## Current state
Not implemented. The app loads markdown files through GitHub or the Electron local-Git bridge, but there is no action definition model, action loader, action service, React hook, `custom prompt` built-in, validation or circular-call check. The actions folder is recognized as a special folder type ([[F-003]]) but its contents are not parsed.

## implementation details
- Add a typed action model for json definitions with `name`, `label`, `description`, `type` (`agent` | `cmd`), `text`, and optional `icon`, `appliesTo`, `before`, `after`, `on` and `onState`. Sub-actions in `before`/`after`/`on` may be inline definitions or string refs to other actions by `name`.
- Load actions from the configured project actions folder when a project opens.
- Register a built-in `custom prompt` agent action in the model, independent of any project action files, so later slices can always offer it.
- Validate on load and fail fast with a clear error on: invalid json, missing required fields, unknown action refs, duplicate `name`, or circular calls through `before`/`after`/`on`.
- Hold the loaded action list in a singleton app service and expose it to React through a hook. This slice only reads/exposes definitions; running and displaying them come later.
- Do not silently fall back to partial behavior when any definition is invalid.

## acceptance criteria
- Opening a project loads valid action json files from the configured actions folder and exposes them to React through the action hook.
- The built-in `custom prompt` action is present in the exposed action set.
- Invalid json, missing required fields, unknown action refs, duplicate names and circular references each produce a clear load error and prevent partial loading.
- Inline and by-name sub-action references resolve to the same underlying definitions.
- Tests cover model parsing, ref resolution, each validation failure and circular-call detection.

## see also
- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\data management.md`
- `design\architecture\initial description\overview.md`
