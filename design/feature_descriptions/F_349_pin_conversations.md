---
author: 
id: F_349
internalId: 358764f1-3de7-4aaa-b7e9-b83da22beaa1
title: pin conversations
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__358764f1-3de7-4aaa-b7e9-b83da22beaa1.json
policy:
---

some conversations can remain valid for longer time. user should be able to find them fast. So user can 'pin a conversation: put a 'pin' / 'unpin' icon next to the 'conversation selector' at the top row of the action popup. Also, in the selection list, put a pin after all pinned conversations so the user can easily spot a pinned conversation in the list.

When there are pinned conversations, put a pin in the status bar. when user clicks on the pin, a popup opens, very similar to the 'running agents' button on the status bar. The popup contains a list of all the pinned conversations. when user clicks on a conversation, the related action popup opens.

Put the pin in front of the 'running agents' component.

## Current state

`AgentConversation` has no pinned state. Activity JSON persists conversation data and `viewed`; parser defaults missing `viewed`, while atomic backend updates and cross-window events keep that field synchronized. Conversation picker lists current action/context conversations newest first. `AgentIntegration` loads card conversations by `cardInternalId` and project conversations from activity references, but exposes no project-wide pinned projection. Status bar ends with `RunningAgentsIndicator`; selecting its card run calls `CardPopupService`, which can open live runs but cannot target persisted conversation path.

Activity compaction only validates and canonicalizes data; it does not expire conversations. Pinning therefore preserves discoverability, not conversation lifetime.

## implementation details

* Add required runtime `pinned: boolean` to `AgentConversation`. Persist it in activity conversation JSON; migrate a missing value to `false`. New conversations start unpinned. Parsing and repair reject non-boolean values.
* Add atomic `updateActionConversationPinned(reference, pinned)` storage and action-bridge APIs, matching viewed-state write serialization. Preserve stored `pinned` during later run checkpoints so stale live data cannot undo a user choice. Publish pinned changes after disk write; local and remote windows apply only that field before emitting a conversation-ID-scoped event.
* Let `AgentIntegration` own stable project-wide pinned view data. On first pinned-list request, load all current-project activity conversation references, including card- and project-origin records; thereafter merge run updates and pin events by `AgentConversation.id`. Reset data on project switch. Expose it through `EventTarget` and `useSyncExternalStore` without republishing cards.
* Put pin/unpin icon button directly after agent conversation picker. Disable it for `New conversation`; otherwise reflect displayed live or persisted conversation. Toggle through service, update only after backend success, and report failure through `dialogService`. Include tooltip and `aria-label`.
* Include `pinned` in picker projection. Append pin icon to each pinned menu option without changing newest-first ordering or selection identity; paths remain persistence references, while `AgentConversation.id` remains conversation identity.
* Add `PinnedConversationsIndicator` immediately before `RunningAgentsIndicator` in desktop status bar. Hide it when no conversations are pinned. Its button opens existing status-details surface with pinned conversations newest first; each row shows conversation title, start time, action label, and current card title when card-owned.
* Add persisted-conversation opening to `CardPopupService`: resolve card ownership by `cardInternalId`, build context from current card data, select `actionId`, then initialize history selection from conversation path. Project-origin conversations use project context. If action or card no longer exists, keep row visible but unavailable and report reason through `dialogService` when selected.
* Add parser/persistence, bridge/event, service projection, picker toggle/marker, status indicator, project reset, historical-open, missing-target, and error tests. Run affected app and desktop tests plus each subproject linter.

## acceptance criteria

* Selected persisted or live conversation can be pinned and unpinned from icon beside picker; `New conversation` cannot be pinned.
* Pin state survives reload and project reopen. Later conversation checkpoints and changes from another window do not revert it.
* Every pinned picker option shows pin marker; unpinned options do not. Existing newest-first order remains unchanged.
* With at least one pinned conversation, status-bar pin appears immediately before running-agents control. With none, pin control is absent.
* Status popup lists every pinned card- and project-origin conversation in current project, newest first, with enough action/card context to distinguish equal titles.
* Selecting available row opens related action popup on exact conversation, including completed historical conversation with no live run.
* Renamed or moved card still opens because ownership resolves through `cardInternalId`, not stored path. Missing card or action leaves row visible and produces clear error instead of opening wrong popup or throwing during render.
* Pin write or load failure leaves last confirmed state intact and is reported through `dialogService`.
