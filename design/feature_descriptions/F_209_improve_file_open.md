---
author: 
id: F_209
internalId: 9755a9b8-8161-499f-9020-bd0c53fe17c0
title: improve file open
status: ready
owner: 
affects:
agents:
  - design/activity/card__9755a9b8-8161-499f-9020-bd0c53fe17c0.json
policy:
branch: f_209_improve_file_open
worktree: 1
---
currently:&#x20;

* dropdown to select: folder, repository, instead use toggle button row with icons.
* for folders: when no folder selected, the input box:
  * looks unimportant and hard to find: can we make it stand out
  * use a placeholder so the label is always elevated

## Current state

`ProjectOpenDialog` owns transient source and form state. Its `Source` dropdown offers Personal repository and Public repository everywhere, Local folder in Electron, and Remote in the browser. Remote connects the browser to a remote MD² desktop/server endpoint, then opens a project by root path and branch through `RemoteControlStorageService`.

For Local folder, `Local repository folder` is a normal outlined `TextField` with an end-adornment folder picker. When empty, it has no placeholder, its label rests inside the field, and its resting border gives no extra emphasis. Open stays disabled until a path is entered; picker cancellation changes nothing. Recent folders open immediately.

Both `app_menu.tsx` and `project_toolbar_menu.tsx` mount the same dialog. `use_project_toolbar_menu_actions.ts` resolves local paths and routes all source types through `ProjectSessionService`; source changes clear loaded branches and pending open resolution. Project-folder setup and missing-working-folder recovery replace normal source controls.

## implementation details

- In `project_open_dialog.tsx`, replace only the top-level `Source` dropdown with an exclusive `ToggleButtonGroup` containing Repository and Folder buttons. Include `SourceRepository` and `FolderOpen` icons, visible text, an accessible group name, and selected state.
- Keep existing source workflows. Repository shows a secondary `Repository access` select for Personal or Public. Folder maps to Local in Electron and Remote in the browser; **Remote** means the browser uses a WebSocket endpoint to operate on a project hosted by another MD² desktop/server.
- Keep `ProjectSource` as the workflow value used by existing handlers. Derive Repository/Folder selection from it. Selecting Repository uses Personal by default; selecting Folder uses Local or Remote according to `isDesktopMode`. Every top-level or repository-access change clears branch selection, selected repository, and parent-owned open-dialog state before showing the new workflow.
- Preserve `initialSource`: Personal/Public opens Repository; Remote opens Folder. Keep existing GitHub authentication, branch loading, local picker, recent-folder, remote endpoint, project-open, loading, conflict, and recovery behavior.
- In Local folder mode, give the empty path field placeholder `Choose or enter a local folder` and force its label to shrink through `slotProps.inputLabel`, so placeholder remains visible and label stays above it. While empty, use theme `primary.main` border and `custom.primaryBg` halo to distinguish the required field; after entry, return to normal input styling. Keep folder-picker behavior and accessible name, add its style-guide-required tooltip, and preserve its disabled loading state.
- No storage, bridge, service, persistence, or dialog-call-site interface changes are needed.
- Update `project_dialogs.test.tsx`: select sources through accessible toggle buttons; cover Personal/Public repository access, Electron Local folder, browser Remote folder, initial Remote selection, empty local placeholder, picker cancellation, typed paths, and recent folders. Do not assert theme color constants.

## acceptance criteria

- Open Project shows one exclusive Repository/Folder icon toggle row instead of a dropdown that mixes project kind with access method.
- Repository mode exposes Personal and Public access and preserves their existing authentication, repository lookup, branch selection, and open behavior.
- Folder mode exposes Local folder in Electron and Remote endpoint/root/branch fields in the browser. Remote projects still open through remote storage.
- Opening the dialog with Remote as its requested initial source selects Folder and shows the prefilled remote fields when stored connection data exists.
- Changing project kind or repository access clears branch/repository state from the previous workflow; it does not open a project.
- Empty Local repository folder field shows `Choose or enter a local folder`, keeps its label above the placeholder, and has stronger theme-based emphasis than a normal resting input. Entering a path removes empty-field emphasis; successful picker selection retains current direct-open behavior.
- Local Open remains disabled for an empty path and during loading. Folder-picker cancellation leaves input and dialog open. Typed, picked, and recent paths retain current open behavior.
- Project-folder setup, missing-working-folder recovery, GitHub conflict handling, Cancel, and loading states remain unchanged.
- Focused dialog tests pass in both Electron and browser modes; app typecheck, lint, and unit tests remain green.
