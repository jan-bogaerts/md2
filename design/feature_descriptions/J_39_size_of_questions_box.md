---
author: 
id: J_39
internalId: 5f931241-561d-4149-9e7c-f0803db2fef0
title: size of questions box
status: ready
owner: 
affects:
agents:
  - design/activity/card__5f931241-561d-4149-9e7c-f0803db2fef0.json
policy:
changedFiles:
  - app/src/components/actions/agent/action_agent_prompt.test.tsx
  - app/src/components/actions/agent/action_agent_prompt.tsx
  - app/src/components/actions/agent/action_agent_question.grouped.test.tsx
---
on the action popup menu, we show a questions box sometimes. this just seems to consume as much room as it wants, which sometimes means you can no longer read the chatlog. we should keep the resize bar responsive and allow the user to make the questions box smaller, we should also set an initial max height it takes, so not automatically use full size (but still allow if user resizes with the divider

# Current state

* The agent surface of the action popup is one flex column, `app/src/components/actions/run/popup/action_agent_interaction.tsx:40`. Its children are, top to bottom: the log-error banner, `ActionConversationChat` (`flex: 1, minHeight: 0`), `ActionPromptOwner` (which renders the resize bar plus the prompt editor), `ActionAgentApprovals`, and `ActionAgentQuestionOwner` (`action_agent_interaction.tsx:63`).
* `ActionAgentQuestionOwner` renders `ActionAgentQuestion` whenever the bound run carries a `question`. Both of its layout branches are a plain bordered `Stack` with no height limit and no internal scroll (`app/src/components/actions/agent/action_agent_question.tsx:116` and `:175`).
* Because that `Stack` has no `minHeight: 0` and no cap, the flex column cannot shrink it below its content height. The chat is the only sibling that can give way, since it is the sole `flex: 1` child, so a question with many options or long text pushes the transcript towards zero height and the chat log becomes unreadable. That is the reported symptom.
* The single resize bar lives in `ActionAgentPrompt` (`app/src/components/actions/agent/action_agent_prompt.tsx:140`, `role="separator"`, `aria-label="Resize prompt"`). Dragging it sets `promptHeight`, which is persisted under `md2.actionPromptHeight` (`action_agent_prompt.tsx:16`) and defaults to 140.
* The bar is disabled while the prompt editor is empty: `promptEmpty` short-circuits every pointer and key handler (`action_agent_prompt.tsx:81` onward) and sets `tabIndex={-1}` with `cursor: 'default'`. An agent question normally arrives while the prompt is empty, so in exactly the situation the user complains about, the bar does nothing when dragged. That is the "resize bar not responsive" part of the report.
* `clampPromptHeight` (`action_agent_prompt.tsx:61`) computes the available space as the parent element height minus `MIN_CHAT_HEIGHT` (96). The parent is the whole agent column, so the height already taken by the questions box is counted as if it were free space; the clamp therefore permits a prompt height that leaves the chat below its intended 96px floor.
* Approvals (`ActionAgentApprovals`) are unbounded in the same way, but they are outside the scope of this feature.

# Implementation details

Terminology: the **bottom block** is the region below the resize bar, containing the prompt editor and, when the agent is asking something, the questions box. The **questions box** is the bordered surface rendered by `ActionAgentQuestion`.

## Question box moves into the bottom block

* `ActionAgentInteraction` stops rendering `ActionAgentQuestionOwner` as a sibling of the prompt. It reads the pending question with `useRunSelector(boundRunId, (run) => run?.question ?? null)` and passes `questionsPanel={question ? <ActionAgentQuestionOwner bindingStore={bindingStore} /> : null}` to `ActionPromptOwner`, which forwards it unchanged to `ActionAgentPrompt`. Approvals stay where they are.
* `ActionAgentPrompt` wraps the prompt editor box and `questionsPanel` in one bottom-block `Box` (`display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0`). The prompt editor keeps its own height; the questions panel gets `flex: 1, minHeight: 0, overflowY: 'auto'`, so long question content scrolls inside the box instead of growing the block.
* When `questionsPanel` is null the bottom block renders exactly as today, prompt only, so nothing changes for runs without questions.

## Initial cap

* New constants in `action_agent_prompt.tsx`: `MIN_QUESTIONS_HEIGHT = 96` and `QUESTIONS_INITIAL_MAX_FRACTION = 0.4`.
* Until the user has dragged the bar, the questions box is unsized: it takes its content height, capped by `maxHeight = max(MIN_QUESTIONS_HEIGHT, container height * QUESTIONS_INITIAL_MAX_FRACTION)`, measured on the agent column. A short question stays short; a long one stops at 40% of the column and scrolls.

## Resize bar drives the bottom block

* New state `blockHeight: number | null` in `ActionAgentPrompt`. `null` means "unsized", so the cap above applies. It becomes a number the first time the bar is dragged or keyed while a questions panel is present, and is persisted under the new key `md2.actionQuestionsBlockHeight` through `applicationStorage`, mirroring `persistPromptHeight`. On mount with a questions panel present the stored value is read and clamped; a missing or unparsable value leaves `blockHeight` at `null`.
* While a questions panel is present, the bar sets `blockHeight`, with the delta applied the same way as today: dragging up grows the block. While no panel is present, the bar sets `promptHeight` exactly as today.
* Clamping for the block: lower bound `MIN_PROMPT_HEIGHT + MIN_QUESTIONS_HEIGHT`, upper bound `container height - MIN_CHAT_HEIGHT`, so the chat keeps its 96px floor and the bar never becomes a no-op at the extremes.
* The stored prompt height is not rewritten by a block drag. The prompt renders at `effectivePromptHeight = clamp(promptHeight, MIN_PROMPT_HEIGHT, blockHeight - MIN_QUESTIONS_HEIGHT)`, so shrinking the block first eats into the questions box and only then into the prompt; on the next run without questions the prompt returns to its own stored height.
* `clampPromptHeight` subtracts the current questions-panel height as well as `MIN_CHAT_HEIGHT` when a panel is present, so the prompt can no longer claim space the questions box occupies.
* The `promptEmpty` guards are replaced by a single `resizeDisabled = promptEmpty && !questionsPanel`. With a question on screen the bar is draggable and focusable even though the prompt is empty; with neither prompt text nor question it stays inert as today.
* Accessibility: while the questions panel is present the bar's `aria-label` is `Resize prompt and questions`, `aria-valuenow` reports the rounded block height, and `aria-valuemin` reports `MIN_PROMPT_HEIGHT + MIN_QUESTIONS_HEIGHT`. Arrow-key resizing keeps the existing `PROMPT_RESIZE_STEP` of 24px and targets the block.

# Acceptance criteria

* A pending agent question renders inside the bottom block, directly under the prompt editor, and is never taller than 40% of the agent column, with a floor of 96px, before the user resizes anything.
* Question content taller than that cap scrolls inside the questions box; the box itself does not grow.
* With a question on screen, the chat transcript keeps at least `MIN_CHAT_HEIGHT` (96px) of height in every layout state, including a question with many options and long text.
* Dragging the resize bar while a question is shown and the prompt is empty changes the bottom-block height; today it does nothing.
* Dragging the bar down shrinks the questions box first, down to 96px, and only then the prompt, down to 72px; dragging up grows the block until the chat reaches its 96px floor and then stops.
* The block height chosen with the bar is written to `md2.actionQuestionsBlockHeight` and restored the next time a question is shown in the popup; `md2.actionPromptHeight` is not modified by a block drag.
* With no question pending, the bar, the prompt height, the empty-prompt disabled state, and the stored `md2.actionPromptHeight` behave exactly as before this change.
* The bar exposes `aria-label="Resize prompt and questions"` with `aria-valuenow` equal to the block height while a question is shown, and `aria-label="Resize prompt"` otherwise; ArrowUp and ArrowDown resize in 24px steps in both modes.
* Tests cover the cap and internal scrolling of the questions box, the bar staying active with an empty prompt plus a pending question, the shrink order (questions before prompt), the chat floor, and the persistence key round-trip, in `action_agent_prompt.test.tsx` and `action_agent_question.grouped.test.tsx`.
