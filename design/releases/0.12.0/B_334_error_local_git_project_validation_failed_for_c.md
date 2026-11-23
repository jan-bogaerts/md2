---
author: 
id: B_334
internalId: 8e0b5ae2-76a2-4101-86e8-9d19f8736ae0
title: Error: Local Git project validation failed for "C:
status: ready
owner: 
affects:
agents:
  - design/releases/0.12.0/card__8e0b5ae2-76a2-4101-86e8-9d19f8736ae0.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 158497657
sentryOrganization: elastetic
changedFiles:
  - app/src/components/shell/menu/app_menu.tsx
  - app/src/components/shell/project/project_open_dialog.test.tsx
  - app/src/components/shell/project/project_open_dialog.tsx
  - app/src/data/electron_data_bridge.ts
  - app/src/services/project/project_open_flow_service.test.ts
  - app/src/services/project/project_open_flow_service.ts
  - desktop/src/git/git_commands.js
  - desktop/src/git/git_commands.test.mjs
  - desktop/src/git/git_process.js
  - desktop/src/git/git_process.test.mjs
  - desktop/src/shell/bridge_invoke.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - desktop/src/shell/preload.js
  - desktop/src/shell/preload.test.mjs
  - shared/bridge_errors.d.mts
  - shared/bridge_errors.mjs
after: 548342cd-192a-4ca4-9821-cb69c901f1f6
---

## Sentry issue

**Title:** Error: Local Git project validation failed for "C:\Users\janbo\Documents\marketing\vidsy": Command failed: git rev-parse --is-inside-work-tree

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/158497657/)

**First seen:** 2026-11-04T08:31:15Z

**Last seen:** 2026-11-04T08:31:15Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** vre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-D90FAwtc.js)

**Event ID:** 321c63772dbc4afc99a5c05bc70f5901

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-D90FAwtc.js:509:46680` — EventTarget.chooseLocalFolder
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-D90FAwtc.js:136:2419` — Im
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-D90FAwtc.js:136:2271` — vre

## Current state

The local project picker and the typed, recent, and startup local-project flows validate a folder through `resolveLocalProject`. It runs `git rev-parse --is-inside-work-tree` and treats every failure as an unexpected error. `ProjectOpenFlowService` then passes that error to `dialogService.error`, which displays it and reports it to Sentry.

The reported folder was not a Git repository when it was selected. Its `.git` directory was created about two minutes after the Sentry event. This is a recoverable user choice, but the application currently offers no way to initialize the folder and continue. The Git process wrapper also discards `stderr` on unsuccessful commands, preventing reliable classification of the failure.

## Implementation details

- Preserve `stdout` and `stderr` on errors returned by `GitProcess`. This enriches failures for all desktop Git callers without changing their success or failure behavior.
- Add a shared, bridge-safe error code for a selected folder that is not a Git repository. Include the selected root path in the serialized error fields. Classify only Git's known “not a git repository” response this way; permission, executable, timeout, ownership, and other Git failures remain unexpected errors.
- Add a desktop bridge operation that initializes the selected folder with `git init`, using the folder as the process working directory and without constructing a shell command. Resolve the resulting local project through the existing validation path.
- Add a Git-initialization confirmation state to `ProjectOpenFlowService`. Use it for picker, typed, recent, and startup local-folder validation. Keep the selected path in the service while confirmation is open.
- Render the confirmation in the project-open dialog with the selected path and explicit Yes and No actions. If the user selects Yes, initialize the repository and continue the existing project-open flow. If the user selects No, clear the confirmation and return to local project selection without opening the project, showing another error, or reporting to Sentry.
- Report initialization failures and every other unexpected validation failure through `dialogService.error`. Do not report the expected not-a-repository result through Sentry.
- Add focused tests for failed Git output preservation, error classification and bridge transport, repository initialization, all local-project entry paths, confirmation actions, and expected versus unexpected telemetry routing.

## Acceptance criteria

- Selecting or entering a folder that is not a Git repository asks whether to create a local Git repository in that folder.
- Selecting Yes runs `git init`, validates the new repository, and continues opening the project through the existing flow.
- Selecting No does not initialize or open the project, does not show another error, and does not report the choice to Sentry.
- Picker, typed, recent, and startup local-folder flows use the same confirmation behavior.
- An existing Git repository opens without an initialization prompt and retains its current behavior.
- A failed `git init` does not open the project, shows the actionable Git failure, and is reported to Sentry.
- Permission, missing executable, timeout, dubious ownership, and other unexpected Git failures remain user-visible and are reported to Sentry.
