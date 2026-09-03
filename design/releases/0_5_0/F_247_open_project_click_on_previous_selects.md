---
author: 
id: F_247
internalId: d0c8354f-cfea-4ad6-b863-9bd2dbb54b52
title: open project click on previous selects
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__d0c8354f-cfea-4ad6-b863-9bd2dbb54b52.json
policy:
after: 8a886351-0de3-4d2e-bcab-9865c8fdeced
---
We have a list of previously opened projects in the `open project` dialog. When user clicks on a folder, it gets opened immediately. this is annoying. it should only select. user should still click on `open`

## Current state

In desktop mode, local `Open project` shows up to five recent repository folders. `ProjectOpenDialog` stores chosen or typed path in `localRootPath` and renders it in `Local repository folder`.

Clicking recent-folder row currently sets `localRootPath` and immediately calls `onOpenLocal`. `useProjectToolbarMenuActions.openLocalProject` then trims path, resolves project through Electron bridge, and starts project-open flow. This bypasses explicit `Open Local` confirmation.

`Open Local` already opens current `localRootPath`. Button stays disabled while path is empty or project load is active. Folder-picker behavior is separate and remains unchanged.

Here, **select** means copying recent folder path into `Local repository folder`; it does not start project loading.

## Implementation details

* Change recent-folder click handler in `app/src/components/shell/project/project_open_dialog.tsx` to set `localRootPath` only. Remove direct `onOpenLocal` call from this handler.
* Keep `Open Local` handler as sole submit path for typed or recent-folder values. Do not change path trimming, Electron resolution, project-open error handling, or successful-project history recording in `use_project_toolbar_menu_actions.ts`.
* Keep missing `data-root-path` failure explicit. Do not add alternate path state or compatibility behavior.
* Update existing local-folder dialog test in `project_dialogs.test.tsx`: recent-folder click fills input and does not call `onOpenLocal`; subsequent `Open Local` click calls it with selected path.

## Acceptance criteria

* Clicking recent folder copies its exact path into `Local repository folder` without resolving or opening project.
* After recent folder is selected, `Open Local` is enabled when no load is active.
* Clicking `Open Local` after selection calls local-open flow once with selected path.
* Selecting recent folder does not reorder or persist recent-project history; history changes only after successful open.
* Typed-path opening, folder picker, loading-state disabling, project setup resolutions, and local-open error reporting keep current behavior.