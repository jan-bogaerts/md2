---
author: 
id: F_166
internalId: 1ebcfe45-9445-47e6-8619-6c72708bd91b
title: Improve input and bottom row on action popup
status: ready
owner: 
affects:
agents:
  - design/releases/0_2_0/card__1ebcfe45-9445-47e6-8619-6c72708bd91b.json#conversation=agent-d07918ff-494f-49f9-bd94-83b66ca6a75e
  - design/releases/0_2_0/card__1ebcfe45-9445-47e6-8619-6c72708bd91b.json#conversation=agent-5ad31f39-ce51-41fb-821c-17894b5623d3
  - design/releases/0_2_0/card__1ebcfe45-9445-47e6-8619-6c72708bd91b.json#conversation=agent-cdc683c1-d6b6-4175-9d9e-3246fc590f6d
policy:
---
We need to improve layout and position of input and bottom row. The goal is to provide as much viewing area as possible to the chatlog while providing optimal input size while editing a prompt.

The bottom row should be inside the box of the input, sticky to the bottom, so no longer a gray bar at the bottom of the popup.

When the input box has no value (empty), it should be 1 line high, box itself ofcourse more for border and bottom row. The resize bar should be disabled.

When it has a value, the box can be enlarged to its last size. Resize bar is enabled again.

## Current state

`ActionAgentPrompt` renders a fixed-height prompt surface below the conversation. Its horizontal resize bar is always enabled. Prompt height starts from `md2.actionPromptHeight`, or 140 px when no saved height exists, and remains unchanged when the prompt becomes empty. The prompt therefore reserves the same chatlog space whether it contains many lines or no text.

`ActionPopupBottomRow` is a separate popup footer after the scroll body. It uses `background.default`, a top border, and popup-wide padding, which creates the gray bar below the prompt. It owns usage information and Finish, Schedule, Send, Run, and Stop controls. Command actions have no visible prompt surface, so their Run row must remain standalone.

## Implementation details

- Define an empty prompt as `prompt.trim().length === 0`, consistent with existing Send and Schedule rules.
- Make the prompt surface a column with three regions: scrollable editor, optional predefined phrases, and `ActionPopupBottomRow` as a non-scrolling footer. Sticky means the footer remains visible at the surface bottom while editor content scrolls; it does not require CSS `position: sticky`.
- For an agent prompt, render the bottom row inside the prompt border. Use the prompt surface background and one internal divider; remove the separate gray popup footer. Keep current usage and control behavior, subscriptions, tooltips, validation, scheduling, run, finish, and stop operations.
- Keep the standalone bottom row for a command action when no agent prompt is visible. During a chained agent interaction, use the agent prompt layout.
- When the prompt is empty, collapse only the editable region to one text line. Border, padding, visible predefined phrases, and bottom row add their required height.
- Disable the prompt resize bar while the prompt is empty. Disabled means pointer drag and Arrow Up or Arrow Down do not resize, the bar is outside tab order, and assistive technology receives `aria-disabled="true"`.
- Preserve the most recent non-empty prompt height in component state and `md2.actionPromptHeight`. Collapsing an empty prompt must not overwrite that saved height. When text becomes non-empty, restore and clamp the saved height against the existing minimum chat height and available popup height; use the existing default when no saved height exists.
- Subscribe to prompt text at the smallest component that changes prompt height or resize availability. Do not hoist draft updates into `ActionPopupContent`, because chatlog and unrelated popup content must not rerender for each keystroke.
- Extend `action_agent_prompt.test.tsx`, `action_popup_bottom_row.test.tsx`, and popup integration tests. Cover empty and whitespace-only drafts, live empty/non-empty transitions, persisted height restoration, disabled pointer and keyboard resize, embedded row layout, editor scrolling, predefined phrases, command Run layout, and unchanged control behavior.

## Acceptance criteria

- Given an empty or whitespace-only agent prompt, its editable region is one line high and the chatlog receives the released vertical space.
- Given an empty prompt, pointer drag and keyboard input cannot change prompt height, and the resize bar is exposed as disabled and cannot receive focus.
- Given text is entered into an empty prompt, the editable region immediately restores the last non-empty height and the resize bar becomes operable without rerendering unrelated popup content.
- Given a non-empty prompt is resized, the new height is saved. Clearing the prompt collapses it without replacing that saved height; entering text again restores the saved height, clamped to available space.
- In an agent interaction, usage information and action controls appear inside the prompt border at its bottom. They remain visible while editor content scrolls, and no separate gray footer appears below the prompt.
- Visible predefined phrases remain inside the prompt surface above the bottom row and keep existing visibility and selection behavior.
- Command actions without an agent interaction keep their standalone bottom Run row and existing behavior.
- Existing Send, Schedule, Finish, Stop, Run, shortcut, validation, tooltip, live-run, persisted-conversation, mobile, and full-height behavior remains unchanged except for requested layout and prompt resizing changes.
