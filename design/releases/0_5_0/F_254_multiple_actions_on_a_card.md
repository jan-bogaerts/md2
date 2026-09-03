---
author: 
id: F_254
internalId: 427d1b08-b9a7-4933-abbb-16c7e60595e1
title: multiple actions on a card
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__427d1b08-b9a7-4933-abbb-16c7e60595e1.json
policy:
changedFiles:
  - app/src/components/actions/agent/action_agent_prompt.test.tsx
  - app/src/components/actions/agent/action_agent_prompt.tsx
  - app/src/components/actions/conversation/action_conversation_picker_owner.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.test.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.tsx
  - app/src/components/editor/markdown_editor.test.tsx
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/editor/use_markdown_draft.ts
  - app/src/services/actions/action_prompt_draft_service.node.test.ts
  - app/src/services/actions/action_prompt_draft_service.ts
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_run_registry.ts
  - app/src/services/markdown/markdown_draft.ts
after: feaf009d-ccf1-489b-bc6f-b3eca1746831
---
it appears we restrict the number of actions that can run on a card. if 1 action is running and we try to start another one, it will even try to queue the message.

this is all super over engineered, nothing of this is needed, all of these restrictions need to be removed: use should be able to run multiple actions at the same time, even of the same type. keep it simple

## Current state

The desktop side already allows concurrency. `ActionRunnerService.start()` in
`desktop/src/services/actions/action/action_runner_service.js` mints a fresh `runId` per request and stores the
`ActionRun` in a runId-keyed map; there is no per-card or per-action guard. Every restriction described below
lives in the renderer.

1. **One live run per action+context binding.** `app/src/services/actions/action_run_registry.ts:914` stores
   exactly one `ActionRunStore` per `rootActionId + contextKey` in `actionContextStores`. Starting a second run
   of the same action on the same card overwrites that entry, so the first run keeps executing in the desktop
   process while every popup component silently switches to the newer run. The registry's `runs` map (keyed by
   runId) and `contextActiveSnapshots` (an array per context) already hold many runs at once, so concurrency is
   blocked only at this binding layer.
2. **Run button gate.** `app/src/components/actions/run/popup/action_popup_run_disabled.ts:18` disables Run when
   `sessionActive && !agentActive` — a live run for this action and context blocks a second start.
3. **The prompt gets queued instead of starting a run.** `runPopupAction` in
   `app/src/components/actions/run/popup/action_popup_operations.ts` routes the Run press to
   `enqueueActionPrompt(run.runId, prompt)` whenever the bound run is a live agent.
4. **A new run continues the live conversation.** `ActionConversationStore.continuationPath()` in
   `app/src/components/actions/conversation/action_conversation_store.ts` prefers the live conversation, and
   `load()` refuses to auto-select a persisted conversation while a run is active.
5. **No way to ask for a fresh conversation.** `action_conversation_picker.tsx` lists persisted conversations
   plus the single live conversation. Its placeholder entry (`value=""`) only clears the selection, after which
   `resolveDisplayedConversation` falls back to the live conversation again.
6. **Shared prompt draft.** `ActionPromptDraftService.getDraft()` keys drafts by `actionId + context`
   (`app/src/services/actions/action_prompt_draft_service.ts:147`), so concurrent runs would type into one draft.
7. **Popup children all read that single binding.** `action_popup_bottom_row.tsx`,
   `action_conversation_chat_owner.tsx`, `action_conversation_picker_owner.tsx`, `action_agent_prompt_owner.tsx`,
   `action_agent_question_owner.tsx`, `action_agent_approvals.tsx`, `action_agent_selectors.tsx`,
   `action_agent_interaction.tsx`, `action_run_status_owner.tsx`, `action_usage_summary_owner.tsx`,
   `action_worktree_selector_owner.tsx`, `action_log_error_owner.tsx`, `command_action.tsx` and
   `action_phrase_buttons_owner.tsx` all subscribe through `useActionRunSelector(actionId, context, …)`.

Concurrent runs of *different* actions on one card already work, because the registry keys per action.

Two existing behaviours stay, by decision, and are **not** restrictions this feature removes:

* The mid-turn prompt queue (`promptQueue` in `desktop/src/services/actions/action/action_run.js`, the
  enqueue/edit/delete IPC, and the queued-prompt rows in `action_queued_prompt.tsx`) remains the way to add a
  follow-up message to a conversation whose agent is still working on its current turn.
* The worktree preparation guard in `app/src/services/project/worktree_service.ts:188` remains. It protects one
  filesystem operation from running twice at the same time; it is not an action-count restriction. Two
  concurrent runs on one card do share the same prepared worktree folder, and that is accepted.

## Implementation details

The unit the popup binds to changes from "the action's run" to "the run behind the conversation the user
selected". The conversation combobox at the top of the popup becomes the switch: it lists every persisted
conversation, every live conversation of every concurrent run of that action, plus an explicit **New
conversation** entry. Selecting **New conversation** puts the popup in an idle state, and the next Run press
starts an additional, independent run.

1. **Registry holds many live runs per binding.** In `app/src/services/actions/action_run_registry.ts`, change
   `actionContextStores` to `Map<string, ActionRunStore[]>`. `handleEvent` appends a new store instead of
   replacing the previous one; `releaseTerminalRun` removes only the finished store from that array and deletes
   the key when the array empties. Add `getActionRunStores(actionId, context)` and `subscribeRun(runId, listener)`.
   Keep `getRunStore(runId)`, and keep `getActionRunStore(actionId, context)` returning the most recently started
   live store, because consumers outside the popup rely on it.
2. **The popup gets a binding store.** Add `app/src/components/actions/run/state/action_run_binding_store.ts`
   holding `boundRunId: string | null`, where `null` means "New conversation". Create it in
   `createActionPopupBindings` (`action_popup_runtime.ts`) so it lives as long as the popup's action+context
   runtime, and expose it on `ActionPopupRuntime`. Its initial value is the most recently started live run for
   that action and context, so opening a popup over a running action still lands on that run.
3. **Popup children subscribe by runId.** Add `useRunSelector(runId, selector)` to
   `app/src/components/hooks/use_action_runs.ts`, backed by `subscribeRun`. Convert every popup child listed in
   *Current state* item 7 from `useActionRunSelector(actionId, context, …)` to the runId form, reading the bound
   runId from the runtime. Components outside the popup (`action_selector_button.tsx`, `card_run_button.tsx`,
   `action_selector.tsx`, `action_popup_initial_action.ts`) keep using the per-context active-run list, which is
   already an array and already collapses several runs into one badge with `waitingForInput` winning.
4. **The picker lists live and persisted conversations plus New conversation.** In
   `action_conversation_picker_owner.tsx`, replace the single live-conversation lookup with the conversations of
   all live runs returned by `getActionRunStores`. In `action_conversation_store.ts`, widen
   `conversationOptions()` to merge that list. In `action_conversation_picker.tsx`, replace the current `value=""`
   placeholder with an explicit `New conversation` entry, so the intent is visible instead of implied by an empty
   selection.
5. **Selection drives the binding.** Selecting a conversation sets `boundRunId` to the live run whose
   `conversation.path` matches, or to `null` when that conversation is finished. Selecting **New conversation**
   clears `boundRunId`, clears `selectedConversation`, and clears the prompt draft of the new binding.
   `resolveDisplayedConversation` and `isBrowsingHistoricalConversation` compare against the bound run's
   conversation instead of the action's single live conversation.
6. **Starting a run adopts the binding.** In `runWithPrompt` (`action_popup_operations.ts`), the `handleStarted`
   callback also calls `bindingStore.setRunId(runId)`, so the popup follows the run it just started.
   `continuationPath()` returns the bound run's conversation path, else the selected persisted conversation's
   path, else `null`. That `null` is what makes **New conversation** open a fresh agent session instead of
   continuing an existing one.
7. **Remove the second-run gate.** Drop the `(sessionActive && !agentActive)` term from
   `action_popup_run_disabled.ts`. With per-run binding, `sessionActive` describes the bound run only, so a popup
   sitting on **New conversation** is never blocked by another run.
8. **Queue only inside the bound conversation.** `runPopupAction` keeps its `enqueueActionPrompt` branch, but it
   is now reachable only when the bound run is a live agent. On **New conversation** it falls through to
   `runWithPrompt`. `cancelPopupAction`, `finishPopupAction` and the restart path act on the bound run.
9. **Drafts keyed per binding.** Add the binding key (`runId ?? 'new'`) to `promptDraftKey` in
   `action_prompt_draft_service.ts` and thread it through `getDraft`, `clearDraft`, `discardUneditedDraft` and the
   registry's `discardUneditedDraft` calls, so two concurrent runs of one action do not share one text box.
   `clearAction(actionId)` keeps clearing every key carrying that action prefix.
10. **Conversation loading no longer assumes one run.** In `ActionConversationStore.load()` and
    `clearPromptDraftWhenIdle()`, replace `getActionRunStore(actionId, context)` with a lookup of the bound run,
    so history loading for one binding is not suppressed by an unrelated concurrent run.
11. **Tests.** Extend the `action_run_registry` tests with two concurrent runs of one action on one card: both
    stores are retained, both are reachable, and terminal cleanup removes only the finished one. Extend
    `action_conversation_picker.test.tsx` with the **New conversation** entry and a second live conversation. Add
    a popup test that presses Run while a run of the same action is live and asserts a second run starts instead
    of a prompt being queued. Keep the existing queued-prompt tests passing for the mid-turn case.

## Acceptance criteria

1. With an agent run of action A live on card C, selecting **New conversation** and pressing Run for action A on
   card C starts a second, independent run. Both runs exist in the desktop process and both complete on their own.
2. The conversation combobox at the top of the action popup always offers a **New conversation** entry, whether
   or not a run is live.
3. The conversation combobox lists one entry per live conversation of that action on that card, alongside the
   persisted conversations. Switching entries switches the popup — chat, status, usage, approvals, questions, and
   the Run/Stop/Finish controls — to that conversation's run.
4. Selecting **New conversation** shows an empty chat and an empty prompt box, and leaves the other runs
   untouched and still running.
5. The Run button is never disabled merely because another run of the same action on the same card is live.
6. Two concurrent runs of one action on one card keep separate prompt drafts; typing in one does not change the
   other.
7. When one of several concurrent runs finishes, only that run leaves the live list; the other runs stay bound,
   stay visible, and keep streaming.
8. Sending a message into a conversation whose agent is mid-turn still queues that message, and the queued-prompt
   row, its edit action and its delete action still work.
9. Running actions of different types concurrently on one card continues to work as before.
10. The action selector badge still shows a single state per action, with `waitingForInput` taking precedence
    over `running` when concurrent runs disagree.
11. `npm run typecheck` and the app test suite pass.
