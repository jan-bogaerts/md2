---
author: 
id: F_328
internalId: 1d05ed50-60c4-42a5-b520-fbc0d625361c
title: better show state of project agent
status: ready
owner: 
affects:
agents:
  - design/activity/card__1d05ed50-60c4-42a5-b520-fbc0d625361c.json
policy:
branch: f_328_better_show_state_of_project_agent
worktree: 2
after: cd8c317c-a566-4ec1-bc4b-e598c892ea89
changedFiles:
  - app/src/components/actions/conversation/action_conversation_chat.tsx
  - app/src/components/agents/agent_chat_fab.test.tsx
  - app/src/components/agents/agent_chat_fab.tsx
  - app/src/components/hooks/use_agent_acknowledgements.ts
  - app/src/components/movable_fab.test.tsx
  - app/src/components/movable_fab.tsx
  - app/src/services/agents/agent_acknowledgement_service.node.test.ts
  - app/src/services/agents/agent_acknowledgement_service.ts
  - app/src/services/agents/agent_integration.test.ts
  - app/src/services/agents/agent_integration.ts
---
currently, we have a FAB that shows, hides the project agent's action popup.

We should better show the state of the project agent like is done with the 'run' button on the cards.

* running: show animation
* waiting for response: show with color
* done, not yet seen: also similar as the run button



also, when we make the window smaller, sometimes the FAB goes out of view. the only way to bring it back is to make the window larger again.

can we make it so, that if the FAB would disapear out of view, we make certain that it remains at the edge?

## Current state

- `AgentChatFab` renders a movable, primary-color FAB and owns whether its project `ActionPopup` is open. It does not subscribe to project action runs or project conversations, so running, waiting, and unseen-result states all look idle.
- `CardRunButton` already gives these states priority in this order: waiting, running, unseen result, idle. Waiting uses `warning.main`, running uses an animated primary ring, and an unseen result uses `info.main` plus a dot. Its accessible label and tooltip describe the active state.
- Project conversations are stored in `AgentIntegration.projectConversations` and loaded when the project action popup requests history. Conversation acknowledgement is card-only: `AgentAcknowledgementService` and `ActionConversationChat` require `cardInternalId`, so a completed project conversation is not marked unseen while its popup is closed or seen while its transcript is displayed.
- `MovableFab` clamps its position during initialization and pointer movement. It does not react to a window resize, so coordinates valid for the old viewport can place the FAB outside the new viewport. Here, **viewport** means the browser content area reported by `window.innerWidth` and `window.innerHeight`.

## implementation details

- Give project-origin conversations the same service-owned acknowledgement lifecycle as card conversations. **Conversation scope** means `Card.header.internalId` for a card-owned conversation and project origin when `cardInternalId` is `null`; paths remain persistence references, not identity. Continue matching conversations by `AgentConversation.id`.
- Expose a stable project-conversation snapshot and granular project-conversation change event from the agent services. Load that snapshot when the project FAB mounts, update it when project `agentStarted` or `agentClosed` events arrive, and notify after loading or changing acknowledgement state. Use `EventTarget` and `useSyncExternalStore`; do not keep copied conversation state in `AgentChatFab`.
- Generalize `AgentAcknowledgementService` and `ActionConversationChat` to accept card or project conversation scope. Existing card callers keep current behavior. A project conversation becomes unseen when it reaches waiting, completed, or failed state while its transcript is not visible; displaying that conversation in the open project popup persists `viewed: true` and clears the unseen indication.
- Derive project FAB state with the existing waiting > running > unseen result > idle priority. Prefer live `actionRunRegistry` status while a project run is active, then use loaded project conversations so state survives reload. Queued runs receive the accessible queued description but no new visual state.
- Adapt the state visuals used by `CardRunButton` to the circular FAB: animated primary ring for running, `warning.main` accent and question indicator for waiting, and `info.main` accent and dot for unseen result. Update FAB `aria-label` and tooltip with the same state descriptions. Idle appearance stays unchanged; waiting does not show running animation.
- In `MovableFab`, use one position-clamping function for initialization, dragging, and window `resize`. Re-clamp current coordinates on every resize and remove the listener on unmount. Keep the configured margin when the FAB fits; if an axis is smaller than FAB size plus both margins, reduce the margin on that axis so the full FAB stays inside the viewport.
- Preserve popup toggling, drag threshold, click-after-drag suppression, popup closure when dragging starts, and popup anchoring after the FAB moves.
- Extend focused tests in `agent_chat_fab.test.tsx`, `movable_fab.test.tsx`, `agent_acknowledgement_service.node.test.ts`, and `agent_integration.test.ts`. Cover state priority and transitions, unseen persistence and clearing, resize on both axes, undersized viewport handling, and listener cleanup.

## acceptance criteria

- During a project action run, project FAB shows the same running animation and accessible state description as card Run button.
- While project agent waits for user input, FAB uses warning accent and question indicator, exposes waiting description, and shows no running animation.
- When project action completes or fails while its transcript is not visible, FAB shows unseen-result accent and dot. State remains after project conversations reload.
- Opening project popup alone does not clear unrelated unseen results. Displaying unseen conversation transcript persists it as viewed; FAB returns to next highest state or idle after no unseen project conversation remains.
- If several project conversations have different states, visible FAB state follows waiting > running > unseen result > idle.
- Resizing window repositions FAB only when needed. FAB remains fully inside both viewport axes, keeps normal margin where space permits, and remains reachable in a viewport smaller than normal margin requirements.
- Clicking and dragging FAB, opening and closing popup, and dragging FAB while popup is open retain current behavior.
- Focused component and service tests pass for project state indication, acknowledgement, and resize clamping.
