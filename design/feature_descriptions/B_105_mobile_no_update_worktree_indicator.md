---
author: 
id: B_105
internalId: e4d3228b-4f97-44f2-9948-8896a694c165
title: Mobile no update worktree indicator
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__e4d3228b-4f97-44f2-9948-8896a694c165.json#conversation=agent-0c966c23-596a-4c82-8e53-e239404b89e5
policy:
after: a529defa-f2ad-4307-923b-856a8ce80243
branch: b_105_mobile_no_update_worktree_indicator
worktree: 1
---
When connected through websockets, when a card is assigned to a worktree and the worktree is updated, the component does not get notified when worktree is up to date



Sometimes it works, sometimes it dont

# Current state

The desktop `WorktreeService` checks Git every five seconds and publishes a `WorktreeState` snapshot when status changes. In mobile mode, `RemoteControlStorageService` receives that snapshot through the `worktreesChanged` WebSocket event. App `WorktreeService` then replaces changed records and emits `changed`; `useWorktreeSelectorState` uses that event to rerender `WorktreeSelector` and its card indicator.

The mobile client keeps worktree callbacks only under connection-scoped request and subscription IDs. When WebSocket closes, `handleClose` clears those callbacks. After reconnect, `ensureConnected` restores action-run, Codex-rate-limit, and project-watch subscriptions, but not worktree subscription. Desktop can therefore publish a newer clean snapshot while mobile remains on stale dirty or behind state. Sessions without a disconnect still work, causing intermittent behavior.

Here, **up to date** means assigned worktree is clean and has no commits ahead of or behind project branch: `dirty === false`, `baseAhead === 0`, and `baseBehind === 0`, with no pending project save.

# Implementation details

- Make remote worktree subscription durable across WebSocket reconnects. Keep local `onWorktreesChanged` listener registration alive while treating request ID and server subscription ID as connection-scoped state.
- Use `EventTarget` for local worktree event delivery. Do not add another callback `Map`, listener `Set`, or revision counter.
- When socket closes, clear obsolete request and server subscription state, but retain active local listener. After next socket opens, send exactly one new `onWorktreesChanged` request when listener remains active.
- Continue routing initial `worktreesChanged` event by pending request ID because server sends current snapshot during subscription setup. Route later events by new server subscription ID.
- Cleanup must remove local listener and unsubscribe current server subscription. Cleanup during pending setup must unsubscribe returned server subscription without restoring it.
- Keep desktop polling, `WorktreeService.handleState`, `useWorktreeSelectorState`, `CardWorktreeIndicator`, and indicator status rules unchanged; existing state pipeline rerenders indicator once restored transport delivers snapshot.
- Add focused `RemoteControlStorageService` tests for reconnect restoration, initial event before subscription response, later pushed clean state, cleanup after reconnect, and no duplicate subscription or callback delivery.

# Acceptance criteria

- Given mobile client has active worktree subscription, when WebSocket disconnects and reconnects, client sends one replacement `onWorktreesChanged` request.
- Given desktop reports assigned worktree changed from dirty or behind to up to date after reconnect, mobile card indicator receives new snapshot and removes changed-state styling and stale counts without page reload.
- Initial worktree snapshot sent before replacement subscription response reaches active listener.
- Later worktree snapshots use replacement server subscription ID and reach listener once each.
- Removing listener before or after replacement subscription completes leaves no live server subscription and no later callback delivery.
- Local Electron worktree updates, remote worktree operations, agent-completion refresh, and existing indicator behavior remain unchanged.
- Focused remote-control storage tests pass independently; app unit tests pass.
