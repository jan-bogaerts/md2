---
author: 
id: F_477
internalId: 1281ca20-aa25-484f-a577-8c52cfcf02ee
title: check typing trace
status: ready
owner: 
affects:
agents:
  - design/activity/card__1281ca20-aa25-484f-a577-8c52cfcf02ee.json
policy:
branch: f_477_check_typing_trace
worktree: 1
changedFiles:
  - app/src/components/worktree_selector.test.tsx
  - app/src/components/worktree_selector.tsx
  - app/src/components/worktree_selector_assignment_state.ts
  - app/src/components/worktree_selector_controller.tsx
  - app/src/components/worktree_selector_status_button.tsx
  - app/src/components/worktree_selector_types.ts
  - app/src/services/project/worktree_service.node.test.ts
  - desktop/src/git/worktree_service.test.mjs
---

Check this trace: [Trace-typing.json](file:///C:/Users/janbo/Documents/dev/Trace-typing.json)

it is taken while typing in the markdown editor of a card. this is beginning to feel slugish. what is the system doing?

## Current state

The trace contains 39 keystrokes. One keystroke takes about 203 ms because a background worktree update schedules a synchronous React update at the same time. The remaining keystrokes take 2.8-5.9 ms each. Markdown serialization and link-selection updates occur for every editor change, but they are not the source of the visible pause.

The desktop worktree service periodically reads the primary repository and every linked worktree. It suppresses publication when the resulting `WorktreeState` is unchanged. The renderer also compares individual records and the primary status before dispatching scoped events. An unchanged refresh must therefore stop at the service boundary and must not schedule a React update.

`WorktreeSelector` subscribes to live worktree and persistence state through `useWorktreeSelectorState`. A relevant status change rerenders the complete selector controller even when its menu and dialogs are closed. The dialogs are already mounted only while open, but the subscription still belongs to a component that owns the button, menu, dialog state, and action handlers.

## Implementation details

Keep the existing no-op suppression and add regression coverage across both service boundaries. An unchanged desktop refresh must not notify bridge listeners. Applying an equivalent renderer state must preserve existing record references and must not dispatch `recordChanged`, `recordsChanged`, `primaryStatusChanged`, or the general `changed` event.

Move the always-active `useWorktreeSelectorState` subscription into a small status-button component. This component owns the derived label, tooltip, disabled state, worktree-change indicators, and button rendering. It receives only stable assignment data and the open callback.

Mount the menu and dialog controller only while the menu or a worktree dialog is open. That controller may subscribe to live worktree state while active so action availability and dialog data remain current. The parent selector must not receive changing worktree status as props or own the live subscription.

Do not change the Markdown editor update or persistence flow. The trace does not show an editor-side performance problem that justifies a separate buffering or serialization mechanism.

## Acceptance criteria

- A scheduled worktree refresh that produces no state change does not notify renderer listeners or schedule a React update.
- A worktree record change only notifies subscribers for that record. A primary-status change only notifies subscribers that use primary status.
- While the selector is closed, a relevant worktree update rerenders only the status-button component, not the menu or dialog controller.
- The menu and dialog controller subscribes while active and reflects worktree changes that occur after it opens.
- The worktree menu and dialogs retain their current behavior for assignment, commit, update, integration, unassignment, busy states, and errors.
- Typing in the Markdown editor while a worktree refresh completes no longer produces a long React task from `WorktreeSelector`.
- Focused service and component tests cover unchanged refreshes, scoped status updates, and opening the selector after a background update.
