---
author: 
id: F_204
internalId: 8f424f6d-34f3-4dc5-87ec-0d266b0780f5
title: go to running action on action popup
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__8f424f6d-34f3-4dc5-87ec-0d266b0780f5.json
policy:
branch: f_204_go_to_running_action_on_action_popup
worktree: 3
---
When opening an action popup and there is an action running, go to that action. if there are multiple running, go to the first running, if non are running, check if any is waitingForInput or is ready and has an unread conversation, if so, go to first of that, otherwise go to first in list

# Current state

`ActionPopup` filters actions for current card, file, folder, conflict, or project context while preserving configured selector order. It initializes selection from explicit `initialActionId`; without one, it always selects first applicable action. Generic card **Run** button supplies no action ID, so popup can open on an idle action while another action is queued, running, waiting for input, or has unread result.

Live action state already comes from `ActionRunRegistry`. `queued`, `running`, and `waitingForInput` are active run states scoped by action context. Persisted card conversations already expose `running`, `waiting for input`, and `unseen result` through agent acknowledgement hooks. **Unseen result** means completed or failed conversation whose persisted `viewed` field is `false`; this is requested “ready with unread conversation” state.

Action selector shows these states, and opening conversation marks it viewed. Selection remains local to mounted popup. Explicit action entry points pass `initialActionId` and represent user's direct choice.

# implementation details

- Add one initial-action resolver used by `ActionPopup`. Resolve once when popup mounts; later run or acknowledgement events update indicators but must not move user away from selected action.
- Always honor explicit `initialActionId`. Automatic priority applies only when popup opens without explicit action choice, such as card **Run** button.
- For automatic selection, use selector order and these priority groups:
  1. First action whose live state is `queued` or `running`, or whose persisted card conversation state is `running`. Here, **queued** shares running priority because queued work exists only while action execution is active.
  2. If none, first action that is `waitingForInput` or has `unseen result`. Waiting and unseen actions share one group; “first” means earliest action in selector order.
  3. If none, first action in selector order.
- Subscribe through existing scoped run and acknowledgement paths. Extend acknowledgement hook only if needed to expose stable per-action states to popup controller; do not republish whole cards or conversations.
- Keep currently selected running action available when run changes card fields and action no longer matches updated filters, using existing retained-action behavior.
- Keep action order, state indicators, conversation loading and acknowledgement, prompt drafts, popup stacking, and direct action entry points unchanged. No Electron or persistence change needed.
- Add focused resolver and popup tests for explicit choice, each priority group, multiple candidates, retained filtered action, and stable selection after popup opens.

# acceptance criteria

- Opening generic action popup with one or more `queued` or `running` actions selects first such action in selector order.
- Persisted running card conversation receives same running priority when no matching live run exists.
- When no action is queued or running, popup selects first action in selector order that is either waiting for input or has unseen result.
- When no action needs attention, popup selects first action in selector order.
- Clicking explicit action entry point opens that chosen action even when another action has higher automatic priority.
- Once popup is open, new status or acknowledgement events never change selected action automatically; user selection remains active.
- Running action remains selected and visible if its run changes card fields so action drops out of current applicability filter.
- Opening unseen conversation persists `viewed: true` through existing acknowledgement flow; this feature adds no second read-state mechanism.
- Focused tests cover queued/running equivalence, persisted running, mixed waiting/unseen ordering, fallback, explicit choice, and no automatic switching after open.
