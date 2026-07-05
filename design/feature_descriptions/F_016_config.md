---
id: F-016
title: config
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Provide a browsable `/config` page with sections and quick-jump tabs, typed value editors with descriptions, explicit save/cancel, and a global config service that merges values from React-app, desktop-app and project-level sources depending on the connection setup.

## implementation details
- Add a singleton `ConfigService` in `app/src/services/`, registered through `service_injector`, with two-phase initialization and explicit `get`, `set`, `clear`, `loadDraft`, `saveDraft` and `discardDraft` behavior.
- Define config metadata separately from values: key, section, label, description, value type, allowed options/range, default value, source (`react`, `desktop`, `project`) and editability.
- Replace `createProjectConfig(pushMode)` and direct config constants with values from `ConfigService`; affected call sites are `use_app_bootstrap.ts`, `project_workspace.tsx` and `data_service.ts`. They should receive the new config behavior.
- Keep GitHub env config (`github_auth_config.ts`) fail-fast for required build/runtime values, but expose editable connection settings only for values that can be changed safely at runtime.
- In desktop mode, expose desktop config values through the preload bridge. Use main-process IPC only for values that require main-owned Electron APIs.
- Project config is loaded after a project opens, merged over defaults, and saved through the active storage backend. Missing required project config fields fail with clear errors.
- Build `/config` as a real navigable route or URL-backed view. Sections use hash anchors for quick jumps; desktop shows section tabs on the left, mobile shows them below the toolbar.
- The config page edits a draft only. Save validates and applies changes to services; Cancel or leaving the page clears the draft without changing active config.

## acceptance criteria
- `/config` can be opened directly and navigated with browser back/forward, including section hash jumps.
- Config entries are grouped by section and rendered with typed editors: switch for booleans, dropdown for known values, number input or slider for numeric ranges, and short descriptions for all entries.
- Save applies validated changes to the global config service and affected services; Cancel leaves the active config unchanged.
- Browser-only mode shows React and connection settings only; Electron mode also shows desktop settings through the preload bridge.
- Opening a project loads project config, merges it over defaults, and uses it for working folder, push mode and card type settings.
- Invalid or missing required config shows a clear error and does not silently fall back to partial behavior.
- Config draft state is created only while `/config` is open and cleared when the page closes.
- Unit tests cover config merge/validation and service updates; React tests cover typed editors, save/cancel and desktop/mobile section navigation.

## see also
- `design\architecture\initial description\config.md`
