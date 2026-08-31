---
author: 
id: B_166
internalId: 8021d46c-cb31-4111-9385-9789a43c6c71
title: input incorrectly disabled
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__8021d46c-cb31-4111-9385-9789a43c6c71.json
policy:
after: 038937d3-b99c-4dfd-b1da-76c906c5c31c
---
The input box on the action popup is sometimes incorrectly disabled.

I stopped a streaming action. then send a new prompt to it. now the input box remains disabled until the 'finish' button is pressed. This is even so after restarting the app, the action begins to work as a single shot conversation, which it isn't.

investigate why this is happening, list the decision mechanism that determines when to disable the input.

## Current state

`ActionAgentPrompt` makes editor read-only only while prompt draft preparation status is `loading` or `failed`. Run status, queued prompts, and streaming mode do not directly disable editor.

Draft status is chosen when `ActionPromptDraftService` creates draft. `ActionAgentPromptOwner` requests preparation only for idle agent action with no selected conversation. `ActionPopupBottomRow`, however, requests preparation for every agent draft, including active run drafts.

After Stop and next run start, `clearDraft` removes old draft. Editor owner and bottom row then reacquire same run-scoped draft. If bottom row creates it first, draft starts `loading`. Owner sees active run, so it neither requests nor performs preparation. Editor therefore remains read-only until Finish clears active run draft and switches UI to idle draft. Backend action stays streaming; locked editor only makes conversation behave like single-shot interaction, meaning one prompt can be entered only between separate runs.

Send button uses separate decision mechanism. It requires prepared draft, available backend, allowed agent settings, non-empty text when active agent is involved, live interaction readiness, and no historical conversation selection. Button visibility also depends on idle, running, waiting, active-action type, and whether prompt contains text. These rules do not cause reported editor lock.

## implementation details

* Make `ActionAgentPromptOwner` sole owner of prompt preparation. It keeps current idle-draft preparation rule.
* Change `ActionPopupBottomRow` to acquire draft with `prepare: false`. Bottom row reads draft and editor snapshots but must not initialize preparation state.
* Keep other call sites unchanged: preset name, phrase buttons, send operations, prompt restoration, and conversion already request `prepare: false`.
* Keep editor read-only during real idle prompt preparation. Do not tie editability to run status, streaming mode, queue contents, Send readiness, questions, approvals, or backend availability.
* Add popup regression test covering Stop, terminal transition, new streaming run, post-start draft clearing, and bottom-row-first reacquisition. Verify editor accepts typing while new run is running and later waiting for input.
* Keep desktop runner, streaming flag, queue dispatch, continuation, Finish, and Send rules unchanged.

## acceptance criteria

* After user presses Stop, starts same streaming action again, and run starts, prompt editor accepts typing without waiting for Finish.
* After popup reopen or app restart, persisted waiting conversation accepts input; starting its continuation does not recreate run-scoped draft as `loading`.
* Active run draft always starts ready; only idle draft awaiting prepared default is read-only.
* Finish still clears active draft and ends streaming conversation through existing flow.
* Streaming action remains streaming; fix does not convert it to one-shot execution or change queue dispatch.
* Send enablement and visibility retain existing backend, settings, prompt, interaction-readiness, history, and run-state rules.
* Regression test reproduces prior draft-creation order and fails before fix.