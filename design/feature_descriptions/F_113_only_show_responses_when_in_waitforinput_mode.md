---
author: 
id: F_113
internalId: 903157da-1625-4516-b5c9-b4880ef7fc40
title: only show responses when in waitForInput mode
status: design
owner: 
affects:
agents:
  - design/activity/card__903157da-1625-4516-b5c9-b4880ef7fc40.json#conversation=agent-e3e142b5-17b5-4477-ad8a-fe6a7c1bbd2f
  - design/activity/card__903157da-1625-4516-b5c9-b4880ef7fc40.json#conversation=agent-c93150e9-ac37-4762-a8c3-70de4127c3bd
policy:
after: 
---

When an action has 'response' prompts, the list of buttons is shown below the prompt input as soon as the action starts.
This should only be done when the action is in waitForInput mode.

also, instead of using a full row below the input, lets use a box over the input that hovers over the input at the bottom and slides in

## Current state

Response prompts are the selected action's `phrases`. `ActionPhraseButtonsOwner` shows them for any agent follow-up: while the scoped run is queued, running, or `waitingForInput`, and after the run when a stored conversation can continue. Therefore they can appear as soon as a run starts and outside the period when the agent awaits user input.

`ActionPopupContent` renders the phrase buttons as a separate row after the prompt area. The row consumes popup height instead of floating over the prompt. Selecting a phrase replaces the prompt draft; double-clicking also submits it.

## implementation details

- Use the scoped `ActionRun.status === 'waitingForInput'` as the only visibility trigger. Do not infer this state from conversation availability or agent activity.
- Keep response prompts limited to agent actions with at least one phrase. Hide them during idle, queued, running, and terminal states.
- Move the phrase controls into the prompt surface. Anchor a floating box to the inside bottom edge of the prompt input instead of rendering a sibling row below it.
- Slide the box upward into view when the run enters `waitingForInput` and downward out of view when it leaves. Respect the user's reduced-motion preference.
- Give the floating box a themed popup surface, border, and elevation. Keep wrapping for multiple buttons and keep prompt text, caret, and scrollable content visible above the overlay.
- Preserve phrase behavior: click replaces the current prompt draft; double-click replaces and submits it. Preserve button labels, order, keyboard access, and the `Predefined phrases` accessible group name.
- Add focused tests for visibility across run statuses, transition into and out of `waitingForInput`, placement inside the prompt surface, and unchanged click and double-click behavior.

## acceptance criteria

- Response prompts are absent before the run waits, including while it is queued or running.
- When the scoped run enters `waitingForInput`, its configured response prompts slide into a floating box at the bottom of the prompt input.
- When the run leaves `waitingForInput`, the box slides out and no longer occupies or overlays the prompt.
- Floating box does not add a row below the input or obscure editable prompt content.
- Clicking a response replaces the prompt without submitting it; double-clicking replaces and submits it.
- Agent actions without response prompts and all non-agent actions show no response box.
