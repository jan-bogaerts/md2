---
author: 
id: F_229
internalId: de77178e-987f-437c-9af3-81b704eca3d4
title: action log remains at end when input expands
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__de77178e-987f-437c-9af3-81b704eca3d4.json
policy:
after: 1c141485-6431-438a-a4ca-9443f75443e2
---

In the action popup, when the user enters some text in the input editor, we expand the editor so there is more room for entering text. this all works fine.

There is just 1 annoying thing: when the chatlog was scrolled to the end, expanding the input doesn't keep the log scrolled to the end, it jumps up a little. would be better if the chatlog remained scrolled to the end. of course, if it wasn't scrolled to the end, then we can leave it as it was.

## Current state

`ActionAgentPrompt` uses a compact auto-height editor while the prompt is empty. When the user enters non-whitespace text, the prompt switches to its saved fixed height. This reduces the height available to sibling `ActionConversationChat`.

`ActionConversationChat` already records whether its scroll viewport is at the end, meaning no more than its existing four-pixel tolerance remains below the visible area. After conversation content renders, it scrolls to the new end only while that sticky state remains active. Prompt expansion changes viewport height without rendering the chat, so this correction does not run. The browser preserves the previous `scrollTop`; therefore the new end moves below the visible area.

## implementation details

- Keep scroll ownership in `ActionConversationChat`. Observe its scroll viewport with `ResizeObserver`, which reports changes to an element's rendered size.
- When the observer reports a viewport-height change and sticky state was active before that change, set `scrollTop` to `scrollHeight` after the resize. This keeps the final conversation row visible when prompt expansion reduces chat height.
- When the user had scrolled outside the existing four-pixel end tolerance, leave `scrollTop` unchanged during viewport resize. Existing scroll events remain the source of sticky-state changes.
- Disconnect the observer when the chat unmounts. Keep existing behavior for conversation changes, new conversation content, queued prompts, prompt height persistence, prompt resizing, and popup resizing.
- Add focused `ActionConversationChat` tests with a controllable `ResizeObserver`: shrinking the viewport keeps an end-stuck chat at its new end, while the same resize preserves an explicitly scrolled-up position. Existing prompt tests continue to cover empty-to-non-empty expansion.

## acceptance criteria

- Given the action log is at the end, when the empty prompt expands after the user enters non-whitespace text, the action log remains at the end after layout finishes.
- Given the user has scrolled the action log above the existing four-pixel end tolerance, when the prompt expands, the action log keeps the user's prior `scrollTop`.
- Returning within the end tolerance re-enables sticky behavior for later prompt or viewport size changes.
- Conversation switches and new chat content retain current sticky-scroll behavior. Prompt sizing, saved prompt height, and manual prompt resizing remain unchanged.
- Focused action conversation and prompt tests pass; app unit tests and lint pass.
