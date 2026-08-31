---
author: 
id: F_213
internalId: bfad1b82-e967-48bc-af8f-a11ce1fa4a55
title: agent questions allow other response
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__bfad1b82-e967-48bc-af8f-a11ce1fa4a55.json
policy:
after: 269f5e9f-dbe4-4818-bd5a-7915bba398af
---
when an agents asks 1 or more questions, we currently don't appear to allow for any other response. it needs to be a selection between what the agent proposes. this is not ok, we also need to allow for 'other' responses (user enters input instead) or stop the response completely.

while the UI is waiting for responses, it is also not possible to send a different prompt to the agent cause the 'send' button remains disabled (this might have already been resolved recently). when text is entered in the input, the 'send' button should be enabled.

## Current state

A **structured question** is provider-supplied question data rendered as buttons, selects, or text fields. Single and multi-question UI can submit standard options. It can also mix standard and custom answers, but custom input appears only when provider sends `isOther`; Claude question mapping does not add that field.

Question UI has no way to dismiss questions without ending conversation. Hiding components alone cannot work: desktop runner keeps provider request pending and blocks queued prompt dispatch until question receives a response.

Prompt input now remains editable during pending questions. Non-empty text enables Send and enters prompt queue, but queued prompt waits until question resolves. This fixes original disabled-Send concern.

## implementation details

* Show `Other` text input for every option question. Keep one answer per question, allowing standard option for one question and custom text for another. Trim validation rejects empty custom answers.
* Add `Cancel questions` control to structured-question component. Cancellation dismisses complete pending question set; it does not stop turn, finish conversation, or cancel action sequence.
* Add question-dismiss operation through owner, registry, Electron bridge, remote-control storage, desktop action run, runner service, and provider adapters. Keep answer and dismiss as distinct operations.
* Resolve provider request before removing UI. Claude sends non-interrupting `deny` control response explaining user dismissed questions. Codex returns valid empty `answers` map. Neither response supplies fabricated answers or interrupts active turn.
* After provider accepts dismissal, clear pending question state and publish `agentQuestionDismissed`. Add `Questions dismissed` event to persisted conversation transcript; an event is logged system activity, not user message sent to agent.
* Release queued-prompt dispatch after dismissal. User may type before or after cancellation; first queued custom prompt follows normal FIFO delivery when provider accepts another message.
* Serialize answer and dismiss operations. First accepted operation wins; stale second operation reports error and cannot clear or answer newer question request.
* Keep question components visible and pending state unchanged when dismissal fails. Report error through `dialogService`.
* Add component tests for mixed standard/custom answers and cancel state. Add registry, bridge, remote-control, action-run, runner, Codex adapter, and Claude adapter tests for dismissal, logging, queue release, failure, and answer/dismiss race.

## acceptance criteria

* Every option question offers standard choices and `Other` text input, regardless of provider. User can submit standard answer for one question and non-empty custom answer for another in same question set.
* `Cancel questions` dismisses all currently displayed questions without stopping turn, conversation, or action sequence.
* Successful cancellation removes question components, logs one `Questions dismissed` transcript event, and sends no fabricated user answer.
* Prompt editor remains usable while questions are pending. Non-whitespace text enables Send; prompt may queue before dismissal and dispatches after provider request resolves.
* After cancellation, user can continue conversation with normal free-form prompt. Prompt appears as user message only when dispatched through existing queue flow.
* Claude and Codex both leave pending-question state and continue turn after their provider-specific dismissal response.
* Dismissal failure keeps questions visible and reports error. Answer/dismiss race resolves once, never clears newer request, and never duplicates transcript event.
* Existing standard answers, secret-answer redaction, queued-prompt ordering, approvals, Finish, Stop, and action-sequence behavior remain unchanged.
