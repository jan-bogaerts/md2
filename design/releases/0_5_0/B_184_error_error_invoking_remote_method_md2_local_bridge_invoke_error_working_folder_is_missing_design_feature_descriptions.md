---
author: 
id: B_184
internalId: 8a886351-0de3-4d2e-bcab-9865c8fdeced
title: Error: Error invoking remote method 'md2-local-bridge:invoke': Error: Working folder is missing: design/feature_descriptions
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__8a886351-0de3-4d2e-bcab-9865c8fdeced.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 142417859
sentryOrganization: elastetic
changedFiles:
  - app/src/App.test.tsx
  - app/src/app.tsx
  - app/src/app/use_app_bootstrap.test.ts
  - app/src/components/project_workspace.test.tsx
  - app/src/components/shell/main_window.test.tsx
  - app/src/components/shell/main_window.tsx
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/shell/menu/app_menu.tsx
  - app/src/components/shell/project/project_dialogs.test.tsx
  - app/src/components/shell/project/project_folder_setup_fields.tsx
  - app/src/components/shell/project/project_folder_setup_form.tsx
  - app/src/components/shell/project/project_open_dialog.tsx
  - app/src/components/shell/project/use_project_toolbar_menu_actions.ts
  - app/src/data/bridge_error_rehydration.node.test.ts
  - app/src/data/bridge_error_rehydration.ts
  - app/src/data/data_types.ts
  - app/src/data/electron_data_bridge.ts
  - app/src/data/repository_relative_path.node.test.ts
  - app/src/data/repository_relative_path.ts
  - app/src/services/application_startup_service.ts
  - app/src/services/github/github_storage_writer.ts
  - app/src/services/project/project_loading.ts
  - app/src/services/project/project_session_service.test.ts
  - app/src/services/project/project_session_service.ts
  - desktop/src/project/project_files.js
  - desktop/src/project/project_folder_creation.js
  - desktop/src/project/project_folder_creation.test.mjs
  - desktop/src/shell/bridge_invoke.js
  - desktop/src/shell/bridge_invoke.test.mjs
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - shared/bridge_errors.d.mts
  - shared/bridge_errors.mjs
  - tmp_block4.py
  - tmp_block4b.py
  - tmp_block6a.py
  - tmp_block6b.py
  - tmp_block6c.py
  - tmp_block7.py
  - tmp_tests1.py
  - tmp_tests2.py
  - tmp_tests3.py
after: 72668dda-9401-49ca-adf2-cd433393214d
---
## Sentry issue

**Title:** Error: Error invoking remote method 'md2-local-bridge:invoke': Error: Working folder is missing: design/feature\_descriptions

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/142417859/)

**First seen:** 2026-08-23T19:29:46Z

**Last seen:** 2026-08-23T19:43:22Z

**Occurrences:** 2

**Release:** Not provided

**Environment:** production

**Culprit:** file:///C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/index.html

**Event ID:** 64fc95a18c6841aab3f193ac86702bd1

### Application stack frames

* No application stack frames provided.

Most likely, the user opened a project which was not yet initialized. none of the folders were present. but this should not generate any errors. instead, we should open a dialog that asks the user to specify the values for the special folders the app needs, with defaults filled in. User can select folders with the 'open folder' dialog. when user presses 'ok', the folders that do not exist, are created.

I though that dialog already existed?

## Current state

The dialog does exist, but on the desktop it can never be reached. The missing-folder signal is destroyed as it crosses the Electron IPC boundary, so the renderer treats a recoverable setup situation as an application failure and reports it to Sentry.

### Why the error escapes instead of opening the dialog

The desktop main process raises a *marked* error. `createMissingWorkingFolderError` (`desktop/src/project/project_files.js:100`) builds an `Error` and attaches two custom properties: `code = 'missing-working-folder'` and `workingFolder`. It is thrown by `loadProject` (`desktop/src/project/project_files.js:138`) and by `loadProjectRoot` (`desktop/src/project/project_files.js:153`) whenever the configured working folder path does not exist on disk.

That error is rejected out of the IPC handler registered at `desktop/main.js:188` (`ipcMain.handle(LOCAL_BRIDGE_INVOKE_CHANNEL, ...)`). Electron serializes a rejected `ipcMain.handle` result by message only: the renderer receives a brand new plain `Error` whose message is the main-process message prefixed with `Error invoking remote method 'md2-local-bridge:invoke': Error: `, and both `code` and `workingFolder` are gone. This prefix is visible verbatim in the Sentry title, which is the proof that the reported error is the post-IPC copy and not the original.

The renderer does not repair this. `LocalGitStorageService.loadProject` (`app/src/services/data/local_git_storage_service.ts:81`) returns the bridge promise unchanged, so the stripped error propagates as-is.

`isMissingWorkingFolderError` (`app/src/services/project/project_session_service.ts:64`) then tests `storageError.code === MISSING_WORKING_FOLDER_ERROR` and `typeof storageError.workingFolder === 'string'`. Both are now `undefined`, so the guard returns `false`. `loadProjectSession` (`app/src/services/project/project_session_service.ts:131`) rethrows instead of returning the `missing-working-folder` resolution that would have opened the dialog.

From there it is treated as a crash. `withLoading` (`app/src/services/project/project_session_service.ts:527`) catches it, and because the error was never marked as reported it calls `dialogService.error`, which calls `telemetryService.captureError` first (`app/src/services/dialog_service.ts:52`). That is the Sentry event.

The GitHub storage path is unaffected, because `MissingWorkingFolderError` (`app/src/data/data_types.ts:201`) is constructed inside the renderer by `app/src/services/github/github_storage_loader.ts:188` and never crosses a process boundary. This is why the dialog appears to exist and work when tested against a GitHub project, yet never appears on the desktop.

Remote-control storage has the same defect for a different reason: `app/src/services/data/remote_control_storage_service.ts:861` rebuilds the failure as a new plain `Error` from the response message alone, so `code` and `workingFolder` are lost there too.

### Second gap: startup restore has no resolution path at all

Even with the marker intact, restoring the last project cannot show the dialog. `restoreLastProject` (`app/src/services/project/project_session_service.ts:293`) calls `activateProjectSession` directly rather than `loadProjectSession`, so it has no `missing-working-folder` branch. `ApplicationStartupService.runStartup` (`app/src/services/application_startup_service.ts:93`) awaits it and turns any throw into a startup error banner. A user whose last project's folders were removed, or who cloned the repository fresh without the design folder, is therefore blocked at startup with no way to recover from inside the app.

### What the folders are, and which ones actually block

`ProjectConfig` carries five folder fields. Their defaults are declared at `app/src/data/data_types.ts:14`-`18` and collected in `DEFAULT_PROJECT_CONFIG` (`app/src/data/data_types.ts:501`):

| Field | Default | Meaning |
| --- | --- | --- |
| `projectFolder` | `design` | Repository-root folder containing everything MD² owns. |
| `workingFolder` | `active` | Active cards. Resolved as `projectFolder/workingFolder`. |
| `archivedFolder` | `archived` | Archived cards. |
| `actionsFolder` | `actions` | Action definition JSON files. |
| `releasesFolder` | `history` | Release history. |

`resolveProjectConfigPaths` (`app/src/data/data_types.ts:491`) joins the last four under `projectFolder`, which is how the configured pair `projectFolder: design` plus `workingFolder: feature_descriptions` in this repository's `md2.config.json` produces the path `design/feature_descriptions` in the Sentry title.

Only the working folder is fatal when absent. The other three are tolerated silently — `loadActionFiles` returns an empty list for a missing actions folder (`desktop/src/actions/action/action_files.js:70`). So the current behaviour is inconsistent: one missing folder crashes, three are ignored.

### The two existing setup dialogs, and why neither is sufficient

`ProjectOpenDialog` already renders two different resolution UIs, selected at `app/src/components/shell/project/project_open_dialog.tsx:155`:

- `ProjectFolderSetupForm` (`app/src/components/shell/project/project_folder_setup_form.tsx`) for the `project-folder-setup` resolution, raised when `md2.config.json` is absent entirely (`app/src/services/project/project_session_service.ts:331`). It asks for one value, `projectFolder`, and nothing else; the other four folders silently take their defaults.
- `WorkingFolderChooserDialog` (`app/src/components/shell/project/working_folder_chooser_dialog.tsx`) for the `missing-working-folder` resolution. It offers one button per existing top-level folder plus a "create from template" button. It cannot edit a path, has no folder picker, and covers only `workingFolder`.

Neither lets a user state where the five folders should live, and neither creates the ones that do not exist yet. There is also no project-configuration UI anywhere else in the app for these fields: the only way to change them today is to hand-edit `md2.config.json`.

Folder creation on the local backend is likewise partial. `createProjectNow` (`desktop/src/project/project_files.js:104`) creates a single folder, writes `README.md` into it, and commits. `createProjectFolders` (`app/src/services/project/project_session_service.ts:381`) then separately commits the default action files. Nothing creates `archivedFolder` or `releasesFolder`.

## Implementation details

### 1. Preserve the error marker across both remote boundaries

This is the root-cause fix and is required no matter what the dialog looks like.

- Serialize the marker on the main-process side. In the `ipcMain.handle` at `desktop/main.js:188`, catch the rejection and re-reject with a structured payload that carries `message`, `code` and `workingFolder` rather than letting Electron reduce it to a message string. Use a general shape (any `error.code` string plus declared extra fields), not a `missing-working-folder` special case — `B_183` is the same class of bug for a different error, and a general fix serves both.
- Rehydrate on the renderer side. The renderer must turn that payload back into a real `MissingWorkingFolderError` (`app/src/data/data_types.ts:201`) so `instanceof` checks and the `code`/`workingFolder` guard both work again. Put the rehydration in one place that every bridge call passes through — the `invokeBridge` wrapper in `desktop/src/shell/preload.js:151` cannot construct renderer classes, so the natural home is a shared helper used by `LocalGitStorageService` (`app/src/services/data/local_git_storage_service.ts`) rather than a per-method try/catch.
- Apply the same rehydration to `RemoteControlStorageService`. The response envelope at `app/src/services/data/remote_control_storage_service.ts:861` currently forwards a message only; extend it to carry the error code and fields, and rebuild the typed error from it. Remote clients run the same loading code, so a remote user hits the identical dead end.
- Do not remove the message prefix by string manipulation. Matching on `code` is the contract; the prefix is cosmetic.

### 2. One folder-setup dialog replaces both existing resolution UIs

Build a single dialog that handles both situations and delete the two forms it supersedes.

- Merge `MissingWorkingFolderResolution` and `ProjectFolderSetupResolution` (`app/src/services/project/project_session_service.ts:31` and `:40`) into one resolution type. It must carry: the project reference, the storage type, the existing top-level folders (for the picker's fallback list), the current or default value of each of the five folder fields, and a flag for whether `md2.config.json` already exists — the two cases differ only in which values are pre-filled and whether an existing config is being amended or a new one written.
- The dialog shows five editable fields, pre-filled with the current configured value where a config exists and with the `DEFAULT_PROJECT_CONFIG` value otherwise. Mark clearly which folders are missing on disk, so the user can see what will be created.
- Keep it inside `ProjectOpenDialog` (`app/src/components/shell/project/project_open_dialog.tsx`), replacing the branch at `:155` and the two conditional blocks that render `ProjectFolderSetupForm` and `WorkingFolderChooserDialog`. Delete both of those components once nothing renders them.
- Validate before enabling OK. Reuse and extend `requireProjectFolder` (`app/src/services/project/project_session_service.ts:94`): reject empty values and paths that escape the repository root. The four sub-folders are stored relative to `projectFolder`, matching `resolveProjectConfigPaths`; `projectFolder` itself is a single root-level folder name.

### 3. Folder picker: native on desktop, autocomplete elsewhere

- On desktop, each field gets a browse button that opens the OS directory dialog. Add a bridge method next to the existing `openProjectFolder` and `selectWorktreeFolder` handlers (`desktop/main.js:152` and `:163`, exposed through `desktop/src/shell/local_bridge_dispatch.js` and the `DATA_METHODS` list in `desktop/src/shell/preload.js:27`). Seed the dialog's starting directory with the repository root.
- The picker returns an absolute path, but the config stores repository-relative paths. Convert on return, and reject a pick that lies outside the repository root with a plain user-facing message rather than an error report — the same class of user mistake as `B_181`.
- On GitHub and remote storage there is no OS picker. Those fields fall back to a free-text input with autocomplete over `listTopLevelFolders`, which is what `ProjectFolderSetupForm` already does. The dialog must therefore accept typed values on every storage type; the picker is an accelerator, not the only input path.

### 4. Creating the folders on OK

- On confirm, compute the resolved paths with `resolveProjectConfigPaths`, create every folder that does not exist, write the config, and then activate the session. Folders that already exist are left untouched.
- Extend the storage-level creation call so it can create a set of folders in one operation instead of one. `StorageService.createProject(project, workingFolder)` and its desktop implementation `createProjectNow` (`desktop/src/project/project_files.js:104`) currently handle a single folder. The change must be implemented for the local, GitHub and remote-control backends, since all three implement `StorageService`.
- Git cannot represent an empty directory. Each created folder needs a placeholder file, as `createProjectNow` already does with `PROJECT_README_TEMPLATE`. Keep creation and its commit inside `withGitIndexMutation` (`desktop/src/project/project_files.js:125`) so it does not race other index operations.
- Keep seeding the default action files into the actions folder, as `createProjectFolders` does today (`app/src/services/project/project_session_service.ts:381`, via `createDefaultActionFiles`).
- Preserve the read-only guard. Both current entry points call `projectAccessService.requireWritable()`; a public GitHub project must not offer folder creation.
- Replace `openWorkingFolder` and `createWorkingFolder` (`app/src/services/project/project_session_service.ts:360` and `:370`) with the single confirm path, and update their callers in `app/src/components/shell/project/use_project_toolbar_menu_actions.ts:296`, `:308` and `:320`.

### 5. Startup restore must reach the same dialog

- Change `restoreLastProject` (`app/src/services/project/project_session_service.ts:293`) to route through the same resolution-returning path as `openProject`, so a missing folder yields a resolution instead of a throw.
- `ApplicationStartupService.runStartup` (`app/src/services/application_startup_service.ts:93`) must pass that resolution to the shell so the folder-setup dialog opens on startup, in place of the current startup error banner. Startup should still reach the `ready` phase; the dialog is the recovery path, not a failure state.

### 6. Stop reporting this as an application error

- Once the resolution path works, the missing working folder never reaches the catch in `withLoading`, so `dialogService.error` and its `telemetryService.captureError` are no longer called for it. Verify this rather than assume it: if any residual path still surfaces the condition to the user, it must use `dialogService.displayError` (`app/src/services/dialog_service.ts:60`), which is the existing channel for expected user-facing errors that are not application failures.

### Related cards

`B_182` is the same Sentry signature for `design/active`, and `B_183` is the same IPC property-loss defect for a different error code. The fix in step 1 should resolve all three; link them rather than duplicating the work.

## Acceptance criteria

- Opening a desktop local project whose configured working folder does not exist opens the folder-setup dialog. No Sentry event is captured, and no error banner is shown.
- The same holds when the project is opened over remote-control storage.
- The same holds for a GitHub project, preserving today's working behaviour.
- Starting the app when the last-opened project's working folder is missing opens the folder-setup dialog instead of showing a startup error. The app reaches the `ready` startup phase.
- A `missing-working-folder` error raised in the desktop main process arrives in the renderer as a `MissingWorkingFolderError` with `code === 'missing-working-folder'` and the original `workingFolder` value intact. A test asserts this across the IPC boundary, not only against an in-renderer throw.
- The same rehydration test passes for the remote-control transport.
- The folder-setup dialog shows five editable fields — `projectFolder`, `workingFolder`, `archivedFolder`, `actionsFolder`, `releasesFolder` — pre-filled with the configured values when `md2.config.json` exists, and with the `DEFAULT_PROJECT_CONFIG` defaults when it does not.
- The dialog indicates which of the five folders are missing on disk before the user confirms.
- On desktop, each field's browse button opens the OS directory dialog and stores the chosen path relative to the repository root. Choosing a folder outside the repository root shows a user-facing message and does not report an error.
- On GitHub and remote storage, each field accepts a typed value with autocomplete over the existing top-level folders.
- Confirming creates every missing folder, leaves existing folders untouched, writes the five values to `md2.config.json`, seeds the default action files into the actions folder, and opens the project — in a single user action.
- Each newly created folder is committed with a placeholder file, so it survives in Git.
- Confirm is disabled for empty or invalid folder values, and the whole dialog is unavailable for read-only projects.
- `ProjectFolderSetupForm` and `WorkingFolderChooserDialog` are removed, and no code path renders a second folder-setup UI.
- Opening a project with no `md2.config.json` at all reaches the same folder-setup dialog, and the resulting project loads with all five folders present.
- A project whose actions, archived or releases folder is missing still loads without error, as it does today.
