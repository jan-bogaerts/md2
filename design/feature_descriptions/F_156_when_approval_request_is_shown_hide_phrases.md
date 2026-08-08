---
author: 
id: F_156
internalId: ade75617-2ab1-40c9-ae62-01700b995632
title: when approval request is shown hide phrases
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__ade75617-2ab1-40c9-ae62-01700b995632.json#conversation=agent-8de6815e-3109-4f01-8525-5bb01fa0406a
  - design/activity/card__ade75617-2ab1-40c9-ae62-01700b995632.json#conversation=agent-d8cd7489-ea9a-4d8b-8267-06fd5f7c80e2
policy:
branch: f_156_when_approval_request_is_shown_hide_phrases
worktree: 3
---

Currently, when an agent shows an 'approval request' in the action-popup and that action also happens to have predefined phrases (responses), then currently the drawer with the responses is also shown. this is not correct, when we already have an 'approval request' with some buttons, we shouldn't show the drawer with all the prhases. it should remain hidden in this situation

## Current state

`ActionPhraseButtonsOwner` shows the predefined-phrase drawer when the scoped action run, or its selected persisted conversation, has `waitingForInput` status. An `agentApproval` event adds an unresolved approval to `ActionRun.approvals` and sets that same run status to `waitingForInput`. Because phrase visibility does not inspect `approvals`, the phrase drawer opens while `ActionAgentApprovals` shows the approval request and its decision buttons.

The phrase drawer is a `Slide` containing a `Paper`; `mountOnEnter` and `unmountOnExit` remove its contents when its `in` condition is false. Approval state is already scoped by root action and action context in `ActionRunRegistry` and exposed through `useActionRunSelector`.

## Implementation details

- In `ActionPhraseButtonsOwner`, subscribe to whether the scoped run has any unresolved approvals: `!!run?.approvals.length`.
- Show the phrase drawer only when the existing `waitingForInput` condition is true and no unresolved approval exists. Keep `mountOnEnter` and `unmountOnExit`, so an approval arriving while phrases are visible hides and unmounts the drawer immediately after the run-store update reaches React.
- Treat an approval as unresolved while it remains in `ActionRun.approvals`. A submitted decision does not reveal phrases; only the corresponding `agentApprovalResolved` event removes that approval. With multiple approvals, keep phrases hidden until all approvals are removed.
- Do not change approval rendering, phrase selection and double-click behavior, persisted-conversation restoration, question handling, or run-status transitions.
- Add action-popup coverage that starts with predefined phrases visible during `waitingForInput`, emits an approval request for the same action and context, and verifies that approval controls remain visible while the phrase group is absent. Also verify that one resolved approval does not reveal phrases while another remains pending.

## Acceptance criteria

- When an approval request is visible in an action popup, that popup does not contain the predefined-phrase drawer.
- If an approval request arrives while the predefined-phrase drawer is visible, the drawer disappears without user action.
- After a decision is submitted, phrases remain hidden until the approval is resolved and removed from pending approval state.
- With multiple pending approvals, phrases remain hidden until the final approval is resolved.
- Approval request text and decision buttons remain visible and usable while phrases are hidden.
- Waiting-for-input behavior without a pending approval is unchanged: configured phrases appear for the matching action and context, and actions without phrases show no drawer.
