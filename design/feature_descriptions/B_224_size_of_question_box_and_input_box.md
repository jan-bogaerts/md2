---
author: 
id: B_224
internalId: fa429997-fee2-4e1d-a21f-3ea586ab12ae
title: size of question box and input box
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__fa429997-fee2-4e1d-a21f-3ea586ab12ae.json
policy:
---

the way that the size of the question box and the input box is managed currently on the action popup, is a bit broken. Currently, as soon as you touch the resize bar (above the input box), the question box goes to minimum size and wont recover anymore. this is a problem.

it should work like this:

* when user enters text in input box, this becomes primary so question box goes to minimum size, the rest is for the input box.
* when user clicks on any location on the question box (so it gets focus), this becomes primary and the input box should go to minimum size while the question box uses the remainder of the space.

# Current state

* `ActionAgentInteraction` renders conversation, then `ActionPromptOwner`. When a structured agent question is pending, `ActionPromptOwner` passes `ActionAgentQuestion` into `ActionAgentPrompt` as `questionsPanel`.
* `ActionAgentPrompt` owns one bottom block containing prompt input and pending structured-question panel. Resize bar above that block changes total block height; it does not record which inner region user is working in.
* Prompt has 72px minimum. Question panel has 96px minimum. Current allocation preserves stored prompt height and gives question panel remaining height. Shrinking block therefore reduces question panel first; after it reaches minimum, later interaction with question panel does not make it grow again.
* Typing only updates prompt draft and empty-prompt layout. Clicking or focusing question panel only operates its controls. Neither interaction changes height allocation.
* Total bottom-block height is stored as `md2.actionQuestionsBlockHeight`. Prompt-only height is stored separately as `md2.actionPromptHeight`. Chat keeps 96px minimum, and an initially unsized question panel remains capped at 40% of agent column.

# Implementation details

Terminology: **primary region** means region receiving bottom-block height left after other region is held at its minimum. It does not change answer state, submit anything, or move focus away from clicked control.

* Extend sizing logic in `ActionAgentPrompt`; no caller needs different behavior. While question is pending, track whether prompt or question panel is primary. Question panel is primary when it first appears.
* A live prompt edit whose value is non-empty after trimming makes prompt primary. Hold question panel at `MIN_QUESTIONS_HEIGHT` and give prompt remainder, never below `MIN_PROMPT_HEIGHT`.
* Pointer-down anywhere in question region, including padding and child controls, makes question panel primary. Focus entering any question control does same for keyboard users. Do not prevent normal button, select, text-field, or focus behavior. Hold prompt at `MIN_PROMPT_HEIGHT` and give question panel remainder, never below `MIN_QUESTIONS_HEIGHT`.
* Switching primary region immediately recalculates both rendered heights from current bottom-block height. If block is still unsized, measure and clamp its current height first. This prevents switch itself from changing total space reserved against chat.
* Dragging or keyboard-resizing bar changes total bottom-block height while preserving primary region. Remainder continues going to primary region throughout resize, so touching bar cannot permanently pin question panel to minimum.
* Keep existing total-block bounds, initial 40% question cap, internal question scrolling, 24px keyboard resize step, separator accessibility, and `md2.actionQuestionsBlockHeight` persistence. Do not persist primary region. When question disappears, prompt-only sizing and `md2.actionPromptHeight` behavior remain unchanged.
* Update `action_agent_prompt.test.tsx`. Replace old question-first shrink expectation with primary-region allocation coverage. Keep `action_agent_question.grouped.test.tsx` coverage for question cap and scrolling.

# Acceptance criteria

* When pending structured question first appears, question panel is primary; prompt stays at least 72px and question panel receives remaining bottom-block height.
* When user types non-whitespace text in prompt, question panel immediately becomes 96px high and prompt receives remaining bottom-block height.
* When user then clicks question panel background or any control inside it, prompt immediately becomes 72px high and question panel receives remaining bottom-block height.
* Keyboard focus entering question controls makes question panel primary without an extra pointer action.
* Repeated prompt edits and question-panel clicks can switch allocation both ways; neither region remains stuck at minimum.
* Dragging resize bar or using ArrowUp/ArrowDown preserves current primary region and allocates changed remainder to it. Chat retains 96px minimum.
* Switching primary region does not change persisted total block height, answer values, submission state, prompt draft, or focused child control.
* Initially unsized question panel keeps current 40% cap. Long question content scrolls inside question region.
* With no pending question, existing empty-prompt collapse, disabled resize bar, prompt resizing, and `md2.actionPromptHeight` persistence remain unchanged.
* Focused prompt sizing tests pass, including question-first default, both interaction-driven switches, repeated recovery, pointer and keyboard access, resize behavior, bounds, and persistence.
