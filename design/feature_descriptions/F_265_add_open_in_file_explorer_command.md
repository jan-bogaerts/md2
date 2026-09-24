---
author: 
id: F_265
internalId: 6cd6114a-3b33-430b-895f-df592f272062
title: add open in file explorer command
status: ready
owner: 
affects:
agents:
  - design/activity/card__6cd6114a-3b33-430b-895f-df592f272062.json
policy:
branch: f_265_add_open_in_file_explorer_command
worktree: 1
changedFiles:
  - app/src/components/card_view/open_in_file_explorer_menu_item.test.tsx
  - desktop/src/project/project_files.js
  - desktop/src/project/project_files.test.mjs
---

in the context menu of cards on the dashboard and for all files in the list view: add a command 'open in file explorer' which opens file explorer, goes to the folder and selects the file

## Current state

No command anywhere reveals a project path in the operating system's file manager. The Electron main process imports `shell` in `desktop/main.js` but only uses `shell.openExternal` (navigation guards) and `shell.openPath` (installer launch in `desktop/src/shell/update_service.js`).

Two menus are in scope:

* **Board card menu** — `CardViewContent` in `app/src/components/card_view/project_card_view.tsx` renders one MUI `Menu`, opened either by the card's three-dot button or by right-click (right-click is ignored on mobile). It already receives `rootPath` from `useProjectReference()` and renders `CardPathMenuItems` (`Copy path`, `Copy relative path`) followed by `Open body` and `Open in file mode`.
* **List view row menu** — the "List" view is the text view file tree. `FileTreeNodeRow` in `app/src/components/text_view/file_tree_node_row.tsx` renders one `Menu` per row, opened by the row's three-dot button or right-click. Node kinds come from `TreeNodeKind` in `app/src/data/file_tree.ts`:
  * `file` rows carry a repository-relative `path` (cards, plain Markdown files, action files).
  * `folder` and `special` rows are real repository folders; their repository-relative location is `directoryPath`.
  * `status` rows are board-status groups and `virtual` is the "agent instructions" group; neither is a real folder.
  * Agent-instruction files (`AGENTS.md`, `CLAUDE.md`, …) are `file` rows with `structuralReadOnly: true`. Such rows get no `onContextMenu` handler and no row action buttons, so they have no menu today.

Renderer-to-desktop calls go through `window.md2Data` (`ElectronDataBridge` in `app/src/data/electron_data_bridge.ts`). The preload script `desktop/src/shell/preload.js` exposes every name in `DATA_METHODS` through the local bridge invoke channel, and `createLocalBridgeDispatch` in `desktop/src/shell/local_bridge_dispatch.js` resolves each method against `currentLocalProject` (the active local project). `window.md2Data` exists only in Electron: the remote-control browser client and web builds have none. A GitHub-backed project opened in Electron has no `rootPath`, so it has no local files to reveal.

`ensureInsideRoot` in `desktop/src/git/git_commands.js` rejects paths that escape the project root. Local-bridge methods are also reachable from remote-control clients through `RemoteControlService`, which forwards any method name to the same dispatcher (existing precedent: `openInEditor`).

## Implementation details

* **Reveal** means: open the OS file manager (Explorer on Windows) at the entry's parent folder with the entry selected. Electron's `shell.showItemInFolder(fullPath)` does exactly this for files and folders on all platforms.
* **Entry** means a file or folder, addressed by its repository-relative path.
* Desktop, `desktop/src/project/project_files.js`: add `resolveExistingProjectEntry(project, entryPath)`. It requires the root via `requireRootPath`, fails fast on a missing or empty `entryPath` (`Missing project entry path`), resolves the full path with `ensureInsideRoot(rootPath, path.join(rootPath, entryPath))`, and throws `Project entry does not exist: <entryPath>` when `fs.promises.stat` fails. It returns the full path. Export it; `local_git_service.js` re-exports it with the other `project_files` functions.
* Desktop, `desktop/src/shell/local_bridge_dispatch.js`: add a `showItemInFolder` dependency and a data-bridge method `showInFileExplorer: async (request) => showItemInFolder(await localGitService.resolveExistingProjectEntry(currentLocalProject, request.path))`. In `desktop/main.js`, pass `showItemInFolder: (fullPath) => shell.showItemInFolder(fullPath)`. Add `'showInFileExplorer'` to `DATA_METHODS` in `preload.js`.
* Renderer, `app/src/data/electron_data_bridge.ts`: add `showInFileExplorer(request: ShowInFileExplorerRequest): Promise<void>` with `ShowInFileExplorerRequest = { path: string }` declared next to the other request types.
* Renderer, new module `app/src/services/file_explorer.ts`: export `canShowInFileExplorer(rootPath)` (true only when `getElectronDataBridge()` is present and `rootPath` is set) and `showInFileExplorer(path)`, which fails fast when the bridge is missing and otherwise awaits `bridge.showInFileExplorer({ path })`. Plain functions, no service class: the module owns no state. No `StorageService` change: revealing is a shell operation, not persistence.
* Renderer, new component `app/src/components/card_view/open_in_file_explorer_menu_item.tsx`: `OpenInFileExplorerMenuItem` with props `path`, `rootPath`, `onSelected`. It renders nothing when `canShowInFileExplorer(rootPath)` is false. On click it calls `onSelected()` to close the menu, awaits `showInFileExplorer(path)`, and reports failures via `dialogService.error(error, { fallbackMessage: 'File explorer could not be opened' })`. Label: `Open in file explorer`. The item stays enabled in read-only projects because it changes nothing.
* Board card menu: render `OpenInFileExplorerMenuItem` with `card.path` directly after the `Open in file mode` item in `project_card_view.tsx`. It appears in both the three-dot menu and the right-click menu, since they share one `Menu`.
* List view, `file_tree_node_row.tsx`:
  * `file` rows (non-structural): add the item with `treeNode.path`, after `CardPathMenuItems`.
  * `folder` and `special` rows: add the item with `treeNode.directoryPath`.
  * `status` and `virtual` rows: no item.
  * Agent-instruction rows (`structuralReadOnly` `file` rows): attach `openContextMenu` so right-click opens the menu, and render a menu that contains only the new item. They still get no row action buttons (no delete, no three-dot button). The `virtual` group row keeps having no menu.
* Remote-control clients never render the item, because `window.md2Data` is absent there. The generic remote dispatcher can still reach `showInFileExplorer`, like `openInEditor`; the path check keeps the call inside the project root.
* Tests:
  * `desktop/src/project/project_files.test.mjs`: `resolveExistingProjectEntry` returns the full path for an existing file and an existing folder, and throws for a missing path, an empty path, and a path escaping the root.
  * `desktop/src/shell/local_bridge_dispatch.test.mjs`: `showInFileExplorer` calls the injected `showItemInFolder` with the resolved full path, and does not call it when resolution throws.
  * `desktop/src/shell/preload.test.mjs`: `showInFileExplorer` is exposed on `md2Data`.
  * New `open_in_file_explorer_menu_item.test.tsx`: hidden without bridge, hidden without `rootPath`; click calls the bridge with the path and closes the menu; bridge rejection reports through `dialogService`.
  * Card and file-tree row tests: item present for cards, files, `folder`/`special` rows and agent-instruction rows (right-click); absent for `status` rows. Mock the bridge via `window.md2Data`.

## Acceptance criteria

* In the desktop app with a local project, the board card menu (three-dot and right-click) shows `Open in file explorer`. Selecting it opens the OS file manager at the card file's folder with the card file selected.
* In the list view, every file row (cards, Markdown files, action files) shows `Open in file explorer` in its menu, with the same result for that file.
* In the list view, `folder` and `special` rows show the command; selecting it opens the parent folder with that folder selected.
* Right-clicking an agent-instruction row opens a menu containing only `Open in file explorer`; it reveals that instruction file. These rows still show no delete or three-dot buttons.
* `status` rows and the "agent instructions" group row show no such command.
* The command is hidden in the remote-control browser client, in web builds, and for GitHub-backed projects without a `rootPath`.
* The command works in read-only projects.
* A path that no longer exists on disk, or that escapes the project root, shows an error dialog (`File explorer could not be opened` with the underlying message) and opens nothing.
* Existing menu items and their order are otherwise unchanged.
* New and updated tests listed above pass.