---
author: 
id: B_99
internalId: 63ee96f0-2707-4a40-80df-dab5b0efda35
title: Mobile status change no update
status: ready
owner: 
affects:
agents:
  - design/activity/card__63ee96f0-2707-4a40-80df-dab5b0efda35.json#conversation=agent-93fc4ca8-571c-43d7-b26b-6344375dc02c
  - design/activity/card__63ee96f0-2707-4a40-80df-dab5b0efda35.json#conversation=agent-1b850d62-92a8-4702-823c-fa3801ac01e8
policy:
branch: b_99_mobile_status_change_no_update
worktree: 1
---

When connected through a websocket, when the backend changes the state of a card, the react side is not notified. A reload is currently needed. Most likely a missing message

## Current state

Here, card state means `status` in card Markdown frontmatter. Electron's project watcher sends file changes as `watchProject` WebSocket events. Mobile client then requests changed file through `RemoteControlStorageService.loadFile`; `ProjectLoading` reparses it, and `DataService` should publish card-level and collection-level `status` events consumed by React board components.

This path was added for [[B-87]], and current tests prove remote file refresh but only change card body. They do not prove that remote `status` changes publish granular events or move card between rendered mobile columns. Reported reload requirement therefore remains an unverified regression; current code does not need separate card-status WebSocket message when `watchProject` works.

## implementation details

- Add integration coverage where a `watchProject` event arrives after mobile project load, remote `loadFile` returns same card with changed `status`, and `DataService` publishes path-scoped `status`, collection `status`, and collection `ordering` events.
- Add mobile React coverage proving changed card leaves old column and appears in new column without reopening project or remounting board.
- Run regression against current path first. Fix first boundary that fails: server watch delivery, remote file load, card reconciliation, granular event publication, or leaf subscription. Keep existing `watchProject` protocol unless server does not emit a file event.
- Preserve watcher debounce, dirty-document conflict protection, subscription cleanup, and Electron behavior.

## acceptance criteria

- After Electron-side process changes loaded card's frontmatter `status`, connected mobile board shows card in destination column after normal watcher debounce, without manual reload.
- Old column no longer contains card, and any open status control shows new value.
- Remote status update publishes only required card and collection events; unrelated card fields do not rerender.
- Added, changed, and removed remote Markdown handling from [[B-87]] still works.
- Desktop project watching and local card moves remain unchanged.
