---
author: 
id: B_219
internalId: 30a808a9-ebec-4f4e-835b-dfb089c714ef
title: copy relative path from remote
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__30a808a9-ebec-4f4e-835b-dfb089c714ef.json
policy:
---
When the react app is connected to the electron app through a websocket, we don't correctly handle the commands 'copy path' an 'copy relative path': they give an error.

this is not correct: we should still allow to copy the path and relative path.

## Current state

* `CardPathMenuItems` (`app/src/components/card_view/card_path_menu_items.tsx`) renders `Copy path` and `Copy relative path` for card tiles (`project_card_view.tsx`) and file-tree card rows (`file_tree_node_row.tsx`). Its `copyCardPath` helper calls `navigator.clipboard.writeText` directly and reports any throw through `dialogService.error` with fallback message `Path could not be copied to clipboard`.
* Remote control means: the React app runs in a browser on another device and reaches the Electron host over a WebSocket, proxied by `RemoteControlStorageService`. The host serves that page over plain HTTP at `http://host:port/` (`buildRemoteConnectUrl`, `app/src/data/remote_connect_string.ts`).
* A page served over plain HTTP from a non-`localhost` host is not a *secure context*, so the browser does not expose the async Clipboard API: `navigator.clipboard` is `undefined`. Reading `.writeText` on it throws a `TypeError` before any copy is attempted, the `catch` fires, and the user sees the copy error dialog instead of a copied path. This is the reported failure, and it hits both menu items.
* In remote-control mode the project reference is proxied whole from the host, so `project.rootPath` is present and points at the host machine's repository directory. Both menu items therefore render remotely; only the clipboard write fails. Remote *GitHub-storage* projects still have no `rootPath` and keep showing only `Copy relative path`, per F\_116.
* A working non-secure-context fallback already exists in the codebase: `copyText` in `app/src/components/shell/remote_control_connection_info.tsx` writes through a temporary hidden `textarea` plus the legacy `document.execCommand('copy')`, which browsers still allow inside a user-gesture handler on insecure origins.

## implementation details

* Extract the clipboard write into one shared renderer helper, `app/src/services/clipboard_text.ts`, exporting an async `copyTextToClipboard(text: string): Promise<void>` that resolves on success and rejects with an `Error` when neither path works.
* Order inside the helper: use `navigator.clipboard.writeText` when `navigator.clipboard` exists; otherwise, or when that call rejects, fall back to the `textarea` + `document.execCommand('copy')` path. Guard the property access so a missing `navigator.clipboard` selects the fallback instead of throwing.
* In the fallback, append the `textarea` to `document.body`, select its content, run `document.execCommand('copy')`, and remove the element in a `finally` so no stray node survives a throw. `document.execCommand` returns `false` when the browser refuses the copy; treat `false` as failure and reject, so the user still gets the existing error dialog rather than silent nothing.
* Point `copyCardPath` in `card_path_menu_items.tsx` at the helper, keeping the current behaviour around it unchanged: close the menu first via `onSelected()`, then write, then report failure through `dialogService.error` with the same `Path could not be copied to clipboard` fallback message. Copied values stay exactly as F\_116 defines them.
* Replace the private `copyText` in `remote_control_connection_info.tsx` with the shared helper so both call sites behave identically. That component currently swallows fallback failures; keep its existing behaviour by catching the rejection there, so the Serve popover's copy button does not start raising new dialogs.
* Renderer-only change. No Electron bridge, no WebSocket message, no persistence, no Git operation, no card or project state change.
* Tests: unit-test the helper for the secure path, the missing-`navigator.clipboard` path, the rejected-`writeText` path, the `execCommand` returning `false` path, and `textarea` cleanup. Extend `card_path_menu_items.grouped.test.tsx` with a remote-style case where `navigator.clipboard` is absent and the copy still succeeds through the fallback with no error dialog.

## acceptance criteria

* With the app served over plain HTTP from a remote host (no `navigator.clipboard`), choosing `Copy relative path` on a card writes the unchanged repository-relative path, for example `design/F_116.md`, and shows no error dialog.
* In that same remote session, choosing `Copy path` writes the host-machine absolute path built from the proxied `project.rootPath`, using the host root's separators, and shows no error dialog.
* In a normal secure-context desktop session, both items keep using the async Clipboard API and produce the values already required by F\_116.
* When both the Clipboard API and the `execCommand` fallback fail, the user sees the existing `Path could not be copied to clipboard` error, and no card, project, or repository state changes.
* Both items still close their menu before the clipboard write, from card tiles and file-tree card rows, whether opened by right-click or the three-dot button.
* The Serve popover's connect-URL copy button keeps working on insecure origins and keeps silently ignoring a failed copy.
* No temporary `textarea` remains in the DOM after a successful or failed fallback copy.