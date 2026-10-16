---
author: 
id: B_314
internalId: 0a89e47c-403c-4f6f-aa8b-97c9493dd2d4
title: project agent - no new agent results available
status: ready
owner: 
affects:
agents:
  - design/activity/card__0a89e47c-403c-4f6f-aa8b-97c9493dd2d4.json
policy:
branch: b_314_project_agent_no_new_agent_results_available
worktree: 1
---

The project agent fab indicates that there are `new agent results available`, but when opening the action popup, there is no action button to be found that indicates the same state.

## Current state

* "Project conversation" means an `AgentConversation` with `cardInternalId === null`. `AgentIntegration.loadProjectConversations` puts all of them in `projectConversations`, whatever action created them. That includes conversations from diagram root and child actions, because those conversations have no card either.
* `AgentChatFab` reads `useProjectAgentState`, which runs `cardAgentState` over every project conversation. A single unviewed conversation from any action shows `New agent result available` on the fab.
* The project popup only renders buttons for `displayActionsForContext(actions, projectContext)`. Each `ActionSelectorButton` (through `useContextActionAgentState`) only checks project conversations with its own `actionId`.
* So an unviewed project conversation whose `actionId` has no project button turns the fab on, but no button shows the matching dot. Known sources:
  * diagram actions (`appliesTo.kind === 'diagram'`), which `actionsForContext` excludes from the project context;
  * actions that were deleted or renamed after the run;
  * actions excluded by `appliesTo`;
  * conversations without an `actionId`.
* `DiagramAgentFab` already uses the filtered pattern: `useProjectActionsAgentState(rootActionIds)`. It only counts root diagram actions (`actionsForContext(actions, ROOT_DIAGRAM_CONTEXT)` in `diagram_view.tsx`). As a result, unviewed child-diagram action results show up on neither fab, except through the unfiltered project fab.

## Implementation details

* `AgentChatFab`: resolve the project context with `useActionAssignmentContext(projectContext())`, the same hook `ActionPopup` uses. That hook applies the project worktree assignment (`worktreeService.getProjectActionWorktree()`) and re-renders on `assignmentChanged`. Compute the project action IDs from `displayActionsForContext(actions, assignmentContext)`, using `useActions`, memoized on `actions` and the context. Pass them to `useProjectActionsAgentState` in place of `useProjectAgentState`. The fab then counts exactly the conversations that have a button in the project popup, including actions limited to the assigned worktree by `appliesTo.worktree`.
* Remove `useProjectAgentState` from `use_agent_acknowledgements.ts`. `AgentChatFab` is its only caller.
* `DiagramView`: also compute `diagramActionIds`, the IDs of all non-builtin actions with `appliesTo.kind === 'diagram'` (root and child). Pass them to `DiagramAgentFab`.
* `DiagramAgentFab`: take `diagramActionIds` as a prop. Use it for `useProjectActionsAgentState`. Keep using `rootActionIds` for the `disabled` state and for filtering live root-context runs. Activating the fab still opens the root popup.
* No change to conversation loading, `viewed` persistence, acknowledgement events or `ActionSelectorButton`.
* Edge cases:
  * Conversations of deleted actions, and conversations without an `actionId`, no longer light any fab. They stay listed in the project agent usage details and in conversation history.
  * Changing the project worktree assignment changes the action set, and with it the fab state. Results of worktree-limited actions count only while that worktree is assigned, matching the popup buttons.
  * A child-diagram result lights the diagram fab, but it is opened from its node popup, not from the root popup.

## Tests

* `agent_chat_fab.test.tsx`:
  * An unviewed project conversation of a diagram action, or of an unknown action ID, leaves the fab idle.
  * An unviewed conversation of a displayed project action shows `New agent result available`.
  * With a project worktree assigned, an unviewed conversation of an action limited to that worktree (`appliesTo.worktree`) shows `New agent result available`. After the assignment is removed, the fab returns to idle.
* `diagram_agent_fab.test.tsx`: an unviewed conversation of a child-diagram action shows `New agent result available`. With no root actions configured, the fab stays disabled.
* Update existing tests that rely on `useProjectAgentState` or on the current `DiagramAgentFab` props.

## Acceptance criteria

* The project fab shows `New agent result available` only when at least one project popup action button shows the unseen-result dot.
* When a project worktree is assigned, unviewed results of actions limited to that worktree light the project fab.
* Unviewed diagram action conversations never change the project fab state.
* Unviewed conversations of root and child diagram actions show `New agent result available` on the diagram fab.
* The diagram fab is still disabled when no root diagram actions are configured.
* The waiting and running states of both fabs keep their current priority (waiting, then running, then queued, then unseen result, then idle).