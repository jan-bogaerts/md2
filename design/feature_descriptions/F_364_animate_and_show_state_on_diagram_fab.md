---
author: 
id: F_364
internalId: cdc16a08-2bb4-4abe-a270-d35616a7ca06
title: animate and show state on diagram fab
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__cdc16a08-2bb4-4abe-a270-d35616a7ca06.json
policy:
after: 530bdc1a-985f-434a-bfe7-acb2f7ca06b8
branch: f_364_animate_and_show_state_on_diagram_fab
worktree: 2
---

just like the fab for the project agent, the fab for the diagram agent should show when it is running, waiting for responses....

## Current state

`DiagramView` renders a movable diagram action FAB only while the diagram service is ready. It enables the FAB when at least one action matches the generic root diagram context and opens that context through `DiagramViewService`. The FAB always shows the same tree icon and label; queued, running, waiting-for-input and unseen-result states do not change it.

`AgentChatFab` already combines live runs from `ActionRunRegistry` with persisted project-origin conversations. It gives waiting highest priority, followed by running, queued, unseen result and idle. Running adds a spinning ring, waiting uses warning colour and a question badge, queued changes accessible text, and unseen result uses info colour and a dot.

Root diagram runs use `diagramContext('root')`. Child actions use diagram-specific item identities, so their live runs are separate. Diagram conversations have no card identity and therefore live in the project-origin conversation collection. They can be isolated from project and child conversations by the configured root diagram action IDs, but the current diagram FAB does not load, subscribe to or filter that collection.

Conversation acknowledgement currently depends on `ActionConversationChat` finding its `popupEntryId` at the top of `cardPopupService`. `DiagramActionPopup` is owned by `DiagramViewService`, supplies no popup entry ID and cannot mark a displayed conversation viewed. Without a visibility contract for this popup, an unseen-result dot could not clear reliably.

## implementation details

* Define one shared FAB presentation state: `idle`, `queued`, `running`, `waiting for input` or `unseen result`. Resolve it with priority `waiting for input > running > queued > unseen result > idle`. Extract the state-dependent label, colours, badges and spinning ring from `AgentChatFab` into its own reusable component. Keep `MovableFab` responsible only for movement and activation. Both project and diagram FABs use the shared presentation, so project behaviour stays unchanged.
* In `DiagramView`, subscribe to active runs for the exact generic root context returned by `diagramContext('root')`. Filter project-origin conversations by IDs from `actionsForContext(actions, rootContext)` and derive their persisted agent state. **Root diagram state** means state produced by those configured root action IDs; child diagram action IDs and project action IDs cannot affect this FAB.
* Load project-origin conversations when diagram view opens, before relying on persisted state. Report load failure through `dialogService` with a diagram-specific fallback message. Keep live run state available even when persisted conversation loading fails.
* Apply project-FAB visuals and accessible wording to the diagram FAB: queued uses `Action is queued`; running uses `Action is running` and the ring; waiting uses `Agent is waiting for input`, warning colour and question badge; unseen uses `New agent result available`, info colour and dot. Prefix state text with `Diagram action`. Preserve `No root diagram actions configured` while disabled.
* Give each `DiagramPopupState` a generated popup entry ID. Extend the shared action-popup conversation visibility contract so caller passes both entry ID and whether popup is visible. `CardActionPopupHostEntry` keeps passing its existing stack-derived visibility. `DiagramActionPopup` passes its service-owned entry ID and visible state. `ActionConversationChat` uses this explicit value instead of reading `cardPopupService` itself, then continues to persist view state through `AgentAcknowledgementService`.
* Opening the diagram popup selects and displays conversation by existing action-popup rules. While visible, displayed unseen conversation becomes viewed and diagram FAB dot clears. Closing, dragging or covering a conversation must not mark a different conversation viewed.
* Add focused tests for shared state priority and presentation, root-context filtering, all diagram FAB states, disabled tooltip, conversation-load failure, popup visibility acknowledgement and unseen-dot clearing. Keep existing project and card popup tests passing. Run affected tests and `npm run lint`.

## acceptance criteria

* Diagram FAB shows idle, queued, running, waiting-for-input and unseen-result states with same visuals and priority as project agent FAB.
* Diagram FAB accessible label and tooltip describe current state. Disabled FAB still says `No root diagram actions configured`.
* Only live runs for generic root diagram context affect queued, running and waiting state. Project runs and child diagram runs do not affect diagram FAB.
* Persisted conversations whose action IDs are configured root diagram actions restore waiting, running or unseen-result state after diagram view or application reload. Project-action and child-action conversations do not affect it.
* Opening visible diagram action popup marks displayed conversation viewed through existing persistence path and clears unseen-result dot. Closing popup, dragging FAB or viewing another popup does not acknowledge a conversation that was not displayed.
* Waiting overrides running, running overrides queued, and queued overrides unseen result when matching states exist at same time.
* Existing project agent FAB behaviour and card, project and diagram popup behaviour remain unchanged apart from diagram popup gaining correct acknowledgement.
* Focused tests and `npm run lint` pass.
