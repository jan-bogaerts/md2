---
author: 
id: F_344
internalId: 1be32ecd-4fa8-4926-a390-3332a18226d5
title: improve open project dialog
status: ready
owner: 
affects:
agents:
  - design/releases/0_6_0/card__1be32ecd-4fa8-4926-a390-3332a18226d5.json
policy:
after: aad6e895-0481-4a5f-b6b3-e4c6d1ac655e
changedFiles:
  - app/src/components/shell/menu/app_menu.tsx
  - app/src/components/shell/project/project_dialogs.test.tsx
  - app/src/components/shell/project/project_open_dialog.tsx
  - app/src/components/shell/project/recent_project_folder_list.tsx
  - app/src/components/shell/project/use_project_toolbar_menu_actions.ts
  - app/src/components/shell/project_toolbar_menu.tsx
  - app/src/data/recent_local_repositories.service.test.ts
  - app/src/data/recent_local_repositories.ts
---

* double click on a folder also opens it immediately
* when mouse hovers over folder, show trash can so the user can remove the folder from the list.

## Current state

`ProjectOpenDialog` shows local history only after user selects **Folder**. It renders `recentLocalRepositories` as plain `ListItemButton` rows below `Local repository folder`.

Single-clicking row copies its path into input. User must then click **Open**. Rows have no double-click behavior and no remove action.

`useProjectToolbarMenuActions` initializes list with `readRecentLocalRepositories` and adds path with `recordRecentLocalRepository` only after local project opens successfully, or after required folder setup completes. `recent_local_repositories.ts` persists at most five paths, newest first, through `applicationStorage`; Windows path matching is case-insensitive. Both `AppMenu` and `ProjectToolbarMenu` use same hook and dialog.

## implementation details

* Extract recent-folder list from `ProjectOpenDialog` into `recent_project_folder_list.tsx`. Component receives paths plus select, open, and remove callbacks. Keep local path and persistence state in existing owners; list owns only row interaction and rendering.
* Keep single-click behavior: select row path without opening it. On row double-click, call local-open callback once with that row's path, without requiring **Open** click. Ignore double-click while `isLoading`, preventing second open while current request runs.
* Use same `openLocalProject` workflow as **Open** button. It resolves selected local repository; successful open closes dialog and records path. If repository needs folder configuration, dialog advances to `Project folders`, and path is recorded only after setup succeeds.
* Render each path row with separate `ListItemButton` and trailing `IconButton`, avoiding nested interactive controls. Keep action in DOM with fixed width and `opacity: 0`; reveal it on row hover or `:focus-within`, matching `STYLE_GUIDE.md` row-action rule. Use `TrashCanOutline`, tooltip, and path-specific `aria-label` such as `Remove C:/project from recent folders`.
* Add `removeRecentLocalRepository(rootPath)` to `recent_local_repositories.ts`. Read current stored value, remove case-insensitive path match, persist filtered list, and return it. Removal changes recent history only: never delete directory contents and never affect open project.
* Add hook callback that awaits `removeRecentLocalRepository`, then replaces `recentLocalRepositories` with returned list. Expose callback from `useProjectToolbarMenuActions`; pass it through both `AppMenu` and `ProjectToolbarMenu` into `ProjectOpenDialog` and list component. On persistence failure, keep row and report error through `dialogService`.
* Existing `readRecentLocalRepositories`, `recordRecentLocalRepository`, and their call sites keep current behavior. No compatibility flag or alternate path format needed.
* Prevent remove-button click from selecting or opening row. Keyboard focus reveals trash action; activating it removes same entry.
* Extend `recent_local_repositories.service.test.ts` for case-insensitive removal, retained order, and missing-path no-op. Extend `project_dialogs.test.tsx` for single-click selection, double-click immediate open, loading guard, and remove action isolation.

## acceptance criteria

* Single-clicking recent folder selects its path but does not open project.
* Double-clicking recent folder immediately starts same local-open workflow as selecting it and clicking **Open**, exactly once.
* Double-click during `isLoading` does not start another open request.
* Each recent row shows trash button on mouse hover and keyboard focus. Button has tooltip and accessible label identifying path.
* Activating trash button removes only selected path from recent list. It does not select path, open project, delete filesystem folder, or affect active project.
* Removed path stays absent after dialog closes, app reloads, or desktop app restarts.
* Path removal matches Windows casing rules; removing `c:/project` also removes stored `C:/Project`. Other paths keep order.
* Existing five-item limit, newest-first ordering, typed-path opening, folder picker, successful-open recording, and project-folder setup flow remain unchanged.
* `recent_local_repositories.service.test.ts` and `project_dialogs.test.tsx` pass; `npm run typecheck` and `npm run lint` pass in `app/`.
