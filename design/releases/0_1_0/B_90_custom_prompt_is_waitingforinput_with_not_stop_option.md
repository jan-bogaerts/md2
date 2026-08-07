---
author: 
id: B_90
internalId: ed76ce11-bea8-4942-aba9-2180b019f5f2
title: custom-prompt is waitingForInput with not stop option
status: ready
owner: 
affects:
agents:
  - design/releases/0_1_0/card__ed76ce11-bea8-4942-aba9-2180b019f5f2.json#conversation=agent-43619894-5772-4f1a-b65b-4d32ffb9b49d
  - design/releases/0_1_0/card__ed76ce11-bea8-4942-aba9-2180b019f5f2.json#conversation=agent-8c7a3c54-fb91-4c2e-b4df-58db8810cfeb
policy:
after: 88a28fc1-ccbf-4d02-b560-c6726a0394dc
---
We had a card where the 'custom prompt' action had a conversation that was in the state 'waitingForInput', but no 'stop' or 'ready' buttons are available to mark the conversation as done.

Note: the application had stopped and restarted, so the agent itself was no longer running and everything was loaded from log

After sending new input to the agent, 'stop' and 'finish' buttons appear again.

This has been seen on regular action for cards as well: when the app is restarted, the 'waitingForInput' state is shown on the 'run' button on the card, but on the action-popup, no 'finish' or 'stop' buttons.

## Current state

`ActionConversationStore` selects the latest persisted `waitingForInput` conversation after restart. Chat and card controls use that persisted status, but `ActionPopupBottomRow` shows Stop and Finish only from a live `ActionRunRegistry` run. Restart suspends the agent and preserves the waiting conversation, while the old run and process no longer exist.

## Implementation details

- When selected conversation is `waitingForInput` and no live run exists, show Stop and Finish. Keep Send available so user can continue conversation.
- Add one Electron/remote bridge operation that atomically reloads conversation by reference and changes only a persisted waiting conversation: Finish sets `completed`; Stop sets `cancelled`; both set `completedAt`. Return updated conversation so renderer stores refresh immediately.
- Keep existing live-run Stop and Finish paths unchanged. Reject missing, malformed, or no-longer-waiting conversations and report failure through `dialogService`.
- Add renderer tests for custom-prompt and regular actions after reload, plus bridge/backend tests for both terminal statuses, timestamp persistence, unchanged conversation data, and rejection of stale state.

## Acceptance criteria

- After restart, persisted waiting custom-prompt and regular-action conversations show enabled Stop, Finish, and Send controls.
- Finish or Stop updates persisted status and `completedAt`; popup and card waiting state clear without an agent process.
- Reload keeps terminal state. Live runs still use normal process controls, and no running conversation can be overwritten by orphan handling.
