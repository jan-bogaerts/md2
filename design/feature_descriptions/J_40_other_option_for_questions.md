---
author: 
id: J_40
internalId: 72313751-3701-45e2-8c8c-59b095a770e2
title: other option for questions
status: ready
owner: 
affects:
agents:
  - design/activity/card__72313751-3701-45e2-8c8c-59b095a770e2.json
policy:
after: 8df7d3db-c367-4792-b4f9-a9bd3ec9d674
changedFiles:
  - app/src/components/actions/agent/action_agent_question.grouped.test.tsx
  - app/src/components/actions/agent/action_agent_question.tsx
---
we now allow for 'other' input for every question that is asked. this is good. however, the 'other' should be an option in the dropdown and only if the user selects it, show the input box

## Current state

`ActionAgentQuestion` (`app/src/components/actions/agent/action_agent_question.tsx`) renders provider questions inside the action popup. It keeps one `answers` map of question id to a single string, and treats a question as answered when that string is non-empty after trimming.

The component has two layouts:

* Single question with options: one `Button` per option (click submits that option immediately), plus an always-visible `TextField` placeholdered `Other` and a `Submit` button.
* Question set (or single question without options): per question, a `Select` when options exist, else a `TextField`. When options exist, a second always-visible `TextField` placeholdered `Other` is rendered below the `Select`.

Because both controls of an option question write the same `answers[question.id]` slot, the layouts disambiguate by value comparison: `Select` shows the stored value only if it matches an option label, and the other field shows it only if it does not. So the free-text box is permanently on screen, takes vertical space in an already cramped popup (see [J\_39](J_39_size_of_questions_box.md)), and "user picked option A" versus "user typed the literal text A" cannot be distinguished.

`AgentQuestion` (`app/src/data/action_run_types.ts`) carries `header`, `id`, `isSecret`, `options`, `question`. There is no provider flag marking a custom answer; `onAnswer` receives `Record<string, string[]>` and every answer is sent as a one-element array of the answer text. That wire contract must not change.

Here "other" means a user-authored answer text that is not one of the provider option labels.

## implementation details

* Change the per-question answer state from one string into a discriminated selection: an option label choice, or an other choice carrying its own draft text. Keep it keyed by question id. Do not infer the mode by comparing the text against option labels.
* Add one synthetic `Other` entry to every option question's choice list. Use a sentinel value that cannot collide with a provider label (for example a `Symbol`-like reserved constant string not used as a submitted answer), and never send the sentinel to `onAnswer`.
* Question-set layout: append the `Other` item as the last `MenuItem` of the `Select`. Render the free-text `TextField` only while that question's selection is `Other`. When user switches back to a provider option, drop the draft text and hide the field.
* Single-question layout: keep option buttons and their one-click immediate submit. Add a trailing `Other` button. Clicking it does not submit; it switches that question into other mode and reveals the `TextField` plus the existing `Submit` button. Before `Other` is clicked, neither the text field nor `Submit` is shown.
* Completeness rule stays per question: an option selection is complete on choice; an other selection is complete only when its draft text is non-empty after trimming. Whitespace-only other text keeps `Submit` disabled.
* Submission sends the selected option label for option choices, and the other draft text exactly as typed for other choices, still wrapped as `[answer]`. Trimming is used only for the completeness check, not for the submitted value, matching current behaviour.
* Preserve `isSecret` on the other field (`type="password"`), and keep the `Other answer for {question}` aria-label so assistive tech and tests can target the field.
* Update `action_agent_question.grouped.test.tsx`: existing other-answer tests must first select `Other` (menu item or button) before typing. Add coverage for the field being absent until `Other` is chosen, for the field disappearing when switching back to a provider option, for whitespace-only rejection, and for a mixed set where one question uses an option and another uses `Other`.
* No change to `AgentQuestion`, `ActionAgentQuestionOwner`, or the answer payload shape.

## acceptance criteria

* An option question shows no free-text input until the user explicitly chooses `Other`.
* In the question-set layout, every option question's dropdown lists all provider options in provider order, then `Other` last.
* Selecting `Other` in the dropdown reveals a text field for that question only; other questions are unaffected.
* Switching from `Other` back to a provider option hides the text field and discards its draft text, and the dropdown shows the chosen option.
* In the single-question layout, clicking a provider option button still submits that option immediately with no extra confirmation.
* In the single-question layout, clicking `Other` submits nothing; it reveals the text field and `Submit`, and `Submit` stays disabled until the text is non-blank.
* Submitting sends the provider label for option choices and the typed text for other choices, in the unchanged `{ [questionId]: [answer] }` shape; the `Other` sentinel is never sent.
* A user typing text identical to an option label after choosing `Other` still submits as that text, and the dropdown does not silently re-interpret it as a provider option choice.
* Secret questions render the other field as a password input.
* `Cancel questions` behaviour and error reporting through `dialogService` are unchanged.
* Focused app tests, typecheck, and lint pass.