---
author: 
id: B_167
internalId: 55de27a5-aa12-4048-9990-970a8382c5b2
title: don't drop input when agent is done
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__55de27a5-aa12-4048-9990-970a8382c5b2.json
policy:
after: e9e0858d-a215-42bb-873e-01848ea6a803
branch: b_167_don_t_drop_input_when_agent_is_done
changedFiles:
  - app/src/services/actions/action_prompt_draft_service.node.test.ts
  - app/src/services/actions/action_prompt_draft_service.ts
---
I already had this several times and is ultra ultra annoying: I am typing in some text when the agent finishes (any state: waitingForInput, completed,..). this just cleans the entire input.

it also appears to cause a reload of the entire popup which is overkill and wrong behaviour.&#x20;

find why it is doing this and propose a solution

## Current state

**Prompt draft** is the editor-backing text object owned by `ActionPromptDraftService` (`app/src/services/actions/action_prompt_draft_service.ts`). Drafts live in one map under two key shapes: `run\0<runId>\0<activeActionId>` while the run has a live agent, and `idle\0<actionId>\0<contextIdentity>` otherwise. `getDraft` picks the run key only when the run belongs to this root action, `activeActionType === 'agent'`, and `activeActionId` is set.

The same editor therefore reads from two different objects depending on live run status. Both keys can hold content at once; `clearDraft` clearing both is the existing acknowledgement of that. Status changes are asynchronous and can land mid-sentence, so which object receives the user's next keystroke is a race the user cannot see or control.

While an agent runs, `MarkdownEditor` flushes typed text into the run-keyed draft on debounce and on blur, so text can still be in flight at the moment the run status changes.

Three registry paths clear that draft when the agent stops:

1. `ActionRunRegistry.handleEvent` (`action_run_registry.ts:709`): an `action` event whose status is not `queued` or `running` counts as inactive and calls `clearRunDraft(runId, actionId)`. An agent turn ending in `waitingForInput` takes this path — the everyday case in the report.
2. The same method at line 692: any terminal `run` event calls `clearRunDrafts(runId)`.
3. `handleRunResult` (`action_run_registry.ts:638`) calls `clearRunDrafts(result.runId)` once the run store reaches a terminal status.

`clearRunDraft` and `clearRunDrafts` call `ActionPromptDraft.clear()`, which calls `replace('')`, bumps `replacementRevision`, and forces `MarkdownEditor` to swap its content for empty text. The draft is then deleted from the map. None of these paths consults `hasLocalEdits()`, so user-typed text and a machine-prepared default prompt are discarded alike. Even without the clear, the key flip alone hides the text: `getDraft` now resolves to the idle key, a different and empty object.

A fourth clear follows on the idle side. `runWithPrompt` (`action_popup_operations.ts:117`) awaits the run, then calls `conversationStore.load()`. `ActionConversationStore.load` (`action_conversation_store.ts:100-145`) publishes `loading: true`, reloads the conversation list, auto-selects `latestWaitingConversation` because the run is no longer active, and then calls `clearDraft` at line 140. `ActionConversationPicker` shows its loading state and the chat re-resolves its displayed conversation during that window; that is the "reload of the entire popup" in the report. `clearPromptDraftWhenIdle` (line 202) clears on the same rule whenever the run is not active.

`ActionAgentPromptOwner` then recomputes `prepare` (`action_agent_prompt_owner.tsx:71-75`). With the session inactive and no conversation selected, `prepare` turns true and the effect calls `promptDraft.prepare(...)`, which `replace()`s the fresh idle draft with the default prepared prompt — overwriting the editor once more.

Delivery responsibility is also misplaced. `ActionPromptDraft` holds a `run` binding set through `bindRun`, and its `send()` (line 141-150) calls the Electron bridge helper `enqueueActionPrompt` and clears itself on success. Its only caller, `runPopupAction` (`action_popup_operations.ts:170`), already fetched the run at line 151 and already uses `run.runId` directly at line 167 on the restart path. A text buffer therefore owns transport, delivery target, and post-send lifecycle that its caller already has in hand — and that ownership is the main reason drafts are keyed by run at all.

The popup does not remount. `CardPopupService` freezes `{ ...context }` per entry and `createActionPopupBindings` is memoized on action plus assignment context, so the stores survive. The perceived reload comes from draft replacement plus the conversation reload.

## implementation details

* Key prompt drafts only by action id plus `actionContextIdentity(context)`. Remove `runPromptDraftKey` and the run/idle namespace split, so one draft serves one editor for the popup's whole life and no status change can swap the object bound to `MarkdownEditor`.
* Strip delivery from `ActionPromptDraft`: remove `send()`, `bindRun`, the `run` field, and the `ActionPromptRunBinding` type. The draft keeps text, revision, `locallyEdited`, and preparation status only. `ActionPromptDraftService.getDraft` loses its `run` parameter.
* Move enqueueing into `runPopupAction` (`action_popup_operations.ts`). It already holds `run`, `run.runId`, the empty-prompt and disabled-run checks, and `dialogService` error reporting. It calls `enqueueActionPrompt(run.runId, prompt)` and clears the draft only after the bridge resolves; a failed enqueue keeps the text and reports the error.
* Clear a draft only when its content was consumed or the user asked for it. Consumed means the prompt was enqueued to a live agent and accepted, or a run started with it (`handleStarted` in `runWithPrompt`), or the user pressed an explicit clear. No status transition, conversation selection, or popup lifecycle event may clear user-edited text.
* Replace `clearRunDraft` and `clearRunDrafts` in `ActionRunRegistry` (`action_run_registry.ts:638`, `:692`, `:709`) with a run-completion hook that discards a draft only when `hasLocalEdits()` is false, so an unused prepared default is dropped while typed text survives every transition, including `waitingForInput`.
* `ActionConversationStore.load` (line 140) and `clearPromptDraftWhenIdle` (line 202) apply the same rule: auto-selecting the latest waiting conversation stays, but it may clear only an unedited prepared draft.
* Gate the preparation effect in `ActionAgentPromptOwner` on the draft having no local edits, so a prepared default never overwrites user text once the single draft outlives the run. `ActionPromptDraft.prepare` already guards on `preparationRequired`, and `edit()` clears that flag.
* Flush any pending `MarkdownEditor` debounce into the draft before a run-completion hook evaluates `hasLocalEdits()`, so text typed in the final moments of a run is not judged as unedited.
* Remove the reload flicker: `ActionConversationStore.load` must not publish `loading: true` when a conversation list is already present and it is only reconciling after a finished run, so the picker and chat keep their rendered state and scroll position.
* Because one draft now spans a whole run, a steering prompt typed but never sent stays in the editor after the run ends and can be sent as the opening prompt of a continuation. This is intended, and it replaces the per-run isolation that existed to stop stale text leaking between sessions.
* Tests: rework `action_prompt_draft_service.node.test.ts` for single-key drafts and the removed `send`; extend `action_popup_operations` coverage for enqueue, clear-on-accept, and keep-on-failure; extend `action_run_registry.node.test.ts` for the `waitingForInput` and terminal paths preserving edited text; extend `action_conversation_store.node.test.ts` for no-clear and no-flicker after a finished run; extend popup tests for typed text surviving completion.

## acceptance criteria

* Typing in the prompt editor while a run reaches `waitingForInput` leaves the text intact, including text still buffered by the editor debounce at the moment of transition. The user never retypes.
* The same holds for every terminal status (`completed`, `failed`, `cancelled`) and for the `action` event that ends an agent step.
* One prompt draft exists per action and context identity. No run status change, conversation selection, or agent-step boundary swaps the object bound to the editor.
* Text retained after completion is editable and sendable: it starts a new run, or continues the selected conversation, without re-entry.
* Sending a prompt to a live agent enqueues through `runPopupAction` and clears the editor only after the bridge accepts. A failed enqueue keeps the text on screen and reports the error through `dialogService`.
* `ActionPromptDraft` exposes no delivery API: no `send`, no `bindRun`, no run binding. Sending a prompt still works from both the Send button and `Ctrl+Enter`.
* A prepared default prompt the user never edited is still cleared or replaced exactly as today. A prepared default never overwrites user-edited text.
* Finishing a run produces no visible popup reload: the conversation picker keeps its rendered list without a loading state and the chat keeps its scroll position, while the newest conversation is still selected.
* Starting a run, Stop, Finish, and saving an edited action definition still clear the draft as before.
* Closing and reopening the popup after completion shows the retained text for that action and card context.