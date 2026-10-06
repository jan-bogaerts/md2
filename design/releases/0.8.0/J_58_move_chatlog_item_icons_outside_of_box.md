---
author: 
id: J_58
internalId: 86f8b326-7ca2-40c8-bcbf-3b596f3efa1e
title: move chatlog item icons outside of box
status: ready
owner: 
affects:
agents:
  - design/releases/0.8.0/card__86f8b326-7ca2-40c8-bcbf-3b596f3efa1e.json
policy:
after: ecdd9654-d1ba-4f4f-9fcc-27997480e062
changedFiles:
  - app/src/components/actions/conversation/messages/action_conversation_message.test.tsx
---
On the action-popup, in the chatlog, we show the chatlog items. The text boxes have 3 icons at the bottom.&#x20;

For visual representation, we should move those 3 icons outside of the chatbox, so below the box. So we also no longer need to reserve so much room at the bottom of the boxes.
## Current state

- `ActionConversationMessage` renders each user/assistant message as one colored bubble: Markdown followed by `ActionConversationMessageCommands` (Copy, Split, Save). Bubble means colored, rounded text container.
- Command row occupies 28px inside bubble even when invisible. It appears on message hover or keyboard focus within message; devices without hover show it continuously. User messages align right; assistant messages align left; message width is capped at 88%.
- `ActionConversationGroupList` is sole production caller of message component; command component is used there and directly in command tests. Event rows have separate Copy-only controls.

## Implementation details

- In `app/src/components/actions/conversation/messages/action_conversation_message.tsx`, make transparent vertical wrapper contain two siblings: colored Markdown bubble and existing command component below it. Keep `.conversation-message` on wrapper so hover/focus covers both siblings and moving pointer from text to buttons keeps controls visible.
- Wrapper retains role-based alignment, 88% maximum width, `minWidth: 0`, and non-shrinking layout. Inner bubble retains background, radius, text padding, Markdown styles, link context, and code-block wrapping. Command row stays inside wrapper's width; user controls align right, assistant controls left. Use theme spacing for small gap between bubble and row.
- Keep row in normal document flow and hide through opacity, preserving its height outside bubble. This prevents hover from shifting later messages. Remove command-height reservation from colored bubble; retain ordinary text padding and configured Markdown margins.
- Keep `ActionConversationMessageCommands` behavior and status subscription unchanged. Both production components and direct command tests retain existing Copy/Split/Save behavior; no shared helper, service, persistence, identity, event-row, or group-header changes required.
- Add message-level regression coverage confirming controls sit outside Markdown bubble and still act on selected message. Reuse existing command tests for disabled states and Save options. During implementation, run affected message/command and transcript rendering tests, app typecheck, and app lint; manually verify layout and hover/focus behavior.

## Acceptance criteria

- Every user/assistant message shows Copy, Split, Save below colored bubble, outside its background. Bubble encloses text with ordinary padding and no command-height space.
- User bubble and controls align right; assistant bubble and controls align left. Hovering either bubble or controls, or focusing any message control, reveals row. Devices without hover show controls continuously. Revealing controls causes no layout shift.
- Short messages, long Markdown, code blocks, streaming output, and narrow popup widths keep text and controls readable without overlap or horizontal clipping, in light and dark themes.
- Copy still copies exact source Markdown. Split and Save retain current running, read-only, pending, and first-prompt rules; tooltips, accessible labels, menus, dialogs, and error reporting remain intact.
- Event Copy controls and collapsed group headers remain unchanged. Focused regression tests, app typecheck, and app lint pass before implementation is submitted.
