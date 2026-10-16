---
author: 
id: B_313
internalId: 7fe6eb2d-0bcd-43aa-ba7c-f1fb3ade4a4c
title: prompt to existing converation on worktree failed
status: ready
owner: 
affects:
agents:
  - design/activity/card__7fe6eb2d-0bcd-43aa-ba7c-f1fb3ade4a4c.json
policy:
branch: b_313_prompt_to_existing_converation_on_worktree_failed
worktree: 3
changedFiles:
  - app/src/components/actions/conversation/messages/action_conversation_message.tsx
  - app/src/components/actions/conversation/transcript/action_conversation_rendering.test.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_operations.node.test.ts
  - app/src/components/actions/run/popup/action_popup_operations.ts
---
I have a card. it was assigned to a worktree, then we started an agent, which ran in the worktree. there were no file changes, so we switched to the primary repository again.

Then I wanted to continue the conversation, but now we get the error: `Failed to sendAssigned worktree branch "f_422_check_if_possible_to_switch_agent_accounts" is unavailable. Select a worktree again.`

This is strange. I don't understand this restriction, it seems over engineered again

## Current state

* `F_422_check_if_possible_to_switch_agent_accounts.md` has no `worktree` field. It is assigned to the primary repository. Its remaining `branch` field is not a worktree assignment and must not affect action execution.
* Both failed activity records are for the built-in custom-prompt action. That action has `needsWorkTree: false`, and both records have no conversation ID. The failure therefore occurred during worktree resolution, before the existing conversation was loaded.
* An action without `needsWorkTree` runs in the primary repository when its `ActionContext` has no worktree assignment. The reported error can only occur when the submitted context still contains a worktree value or worktree error.
* The popup stores the context captured when it opens. `useActionAssignmentContext` attempts to refresh its worktree fields for display and execution, but action submission still trusts the context supplied by the mounted popup. There is no final refresh from the canonical card model when Send is clicked.
* Resolving an assigned worktree by branch is valid protection against running an action in a different checkout after worktrees are removed or reordered. It must apply only when the card is currently assigned to a worktree. There is no functional restriction on continuing a conversation in the primary repository.

## Implementation details

* Before validating or starting a popup action, derive its execution context from the current card in `dataService`, located by `Card.header.internalId`.
* For a card without `worktreeValue`, remove `worktree`, `worktreeBranch`, and `worktreeError` from the execution context. Do not treat `Card.header.branch` by itself as an assignment.
* For an assigned card, copy the current worktree value, branch, and error, then resolve the current worktree number through the existing branch-based assignment logic.
* Use this refreshed execution context for `worktreeValidationMessage`, `beginSubmission`, and the action start request. Conversation selection and `continueFrom` remain unchanged.
* Keep the existing branch validation for genuinely assigned cards. Do not fall back to the numeric worktree position when its expected branch is unavailable.
* The popup may continue using its reactive assignment context for display, but execution must not depend on a context snapshot captured before the assignment changed.
* Render the failed-delivery label and its error as separate blocks or add spacing so the message does not appear as `Failed to sendAssigned...`.

## Tests

* Add an action-popup regression test that opens an existing conversation while the card is assigned, changes the canonical card to Primary while retaining `Card.header.branch`, and sends another prompt. Assert that the start request has no worktree fields and retains the selected conversation's `continueFrom` path.
* Add a complementary test showing that a currently assigned card still resolves and validates its branch before the action starts.
* Add a rendering test that the failed-delivery label and error are visually separated.

## Acceptance criteria

* Continuing an existing card conversation after switching the card to Primary runs in the primary repository.
* A leftover card `branch` without a `worktree` does not trigger worktree validation.
* The execution checkout is derived from the card's current assignment when Send is clicked, not from the assignment present when the popup opened.
* A genuinely assigned worktree whose expected branch is unavailable remains blocked.
* Conversation identity, history, and provider-session continuation are unchanged.
* Failed prompt text is displayed as `Failed to send` followed by a clearly separated error message.
