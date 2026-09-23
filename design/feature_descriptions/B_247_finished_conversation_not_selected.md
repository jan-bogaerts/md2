---
author: 
id: B_247
internalId: 6a25a6de-234c-4d7a-9d59-7ce9e86992b5
title: finished conversation not selected
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__6a25a6de-234c-4d7a-9d59-7ce9e86992b5.json
policy:
---
When a conversation is finished and not yet read, we show a state on the action button (blue button) to indicate the state.

Normally, that action button and the first conversation in the list for that action that was not yet read, should be selected, the action button appears to work, but for the conversation, this appears to be broken recently. please fix.

## Current state

Terms:

* **unseen conversation**: an `AgentConversation` with `viewed === false` (finished, failed, or waiting, and not yet shown in a visible chat).
* **initial selection**: the conversation the popup's `ActionConversationStore` selects on its first history `load()`.

Flow when the popup opens:

1. `resolveInitialActionId` (`app/src/components/actions/run/popup/action_popup_initial_action.ts`) picks the action whose persisted state is `unseen result`. This part works.
2. `createActionPopupBindings` (`app/src/components/actions/run/popup/action_popup_runtime.ts`) creates the `ActionConversationStore` and then always calls `conversationStore.configureInitialSelection(requestedConversationPath ?? null)`.
3. On first render, `ActionConversationPickerOwner` (`app/src/components/actions/conversation/action_conversation_picker_owner.tsx`) calls `store.configureInitialSelection(unseenResultConversations[0]?.path ?? null)`, using `useCardActionUnseenResults`, which returns the newest unseen conversation of the action.
4. `ActionConversationStore.configureInitialSelection` only accepts the first call (`initialSelectionConfigured` guard). `load()` then loads and selects the configured path, unless a bound run is active.

Root cause: commit `b6acd3d2` (F_349 pin conversations) added the call in step 2. Without a requested conversation path, that call locks the initial selection to `null`. The unseen path from step 3 is ignored, so `load()` falls back to `latestWaitingConversation`, which is `null` for a finished conversation. Result: action button selected, conversation not selected.

The store tests in `action_conversation_store.node.test.ts` call `configureInitialSelection` directly on a fresh store, so they do not cover this interaction.

## Implementation details

* `action_popup_runtime.ts`, `createActionPopupBindings`: call `conversationStore.configureInitialSelection(requestedConversationPath)` only when `requestedConversationPath` is set. A requested path (pinned conversation from F_349) still wins, because it is configured first.
* No change to `ActionConversationStore` or `ActionConversationPickerOwner`. The picker owner's unseen path becomes the initial selection again when nothing was requested.
* Priority stays unchanged: requested conversation > unseen conversation (when no bound run is `queued`/`running`/`waitingForInput`) > latest waiting conversation > none.
* Tests, in `action_popup_runtime.node.test.ts`:
  * Without a requested path, a later `configureInitialSelection(unseenPath)` on `bindings.conversationStore` is applied and `load()` selects the unseen conversation (regression test; fails before the fix).
  * With a requested path, a later `configureInitialSelection(otherPath)` is ignored and `load()` selects the requested conversation.

Note, not in scope: `ActionConversationPickerOwner` calls `store.configureInitialSelection` during render, which mutates service state while rendering. The fix keeps this existing behavior.

## Acceptance criteria

* Open the popup of a card whose action has a finished, unseen conversation, with no action run active: the action is selected and the newest unseen conversation of that action is selected in the conversation picker and shown in the chat.
* Showing that conversation marks it viewed, and the unseen state clears from the action button.
* Opening a pinned conversation (F_349) still selects the pinned conversation, even when a different unseen conversation exists.
* When a bound run of the action is `queued`, `running`, or `waitingForInput`, the live run stays displayed; the unseen conversation is not selected automatically.
* Without unseen conversations, behavior is unchanged: latest waiting conversation, else no selection.
* New runtime regression test passes; existing `action_conversation_store.node.test.ts` and `action_popup_runtime.node.test.ts` tests pass.