---
author: 
id: F_172
internalId: 2b696eca-93cd-48b1-a237-b3cb9658e1d8
title: Reasoning block with text
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__2b696eca-93cd-48b1-a237-b3cb9658e1d8.json#conversation=agent-c5226a92-1d97-4a04-a71c-b6302eacfb75
policy:
---
Some reasoning blocks have text. We display that text while the reasoning is still active. however, once the reasoning is done, we hide the reasoning block. This should be changed:

* only hide the block if there is no text
* if there is text, collapse it. user can still expand it again to look at the text.

## Current state

Desktop providers normalize reasoning into conversation events with `summary`, `details`, and `content`. `actionRunRegistry` replaces updates sharing one `providerItemId`, so one reasoning entry receives streaming text and later changes from `inProgress` to `completed` without changing its transcript position.

`ActionConversationChat` removes every completed reasoning entry before building render groups. Therefore completed reasoning disappears even when it contains text, and hidden reasoning does not divide adjacent completed tool calls. `ReasoningEvent` shows `summary` sections when present, otherwise `details`, otherwise `content`; visible reasoning is always expanded. Failed and declined reasoning remains visible with its error state.

## implementation details

- Define **displayable reasoning text** as at least one non-whitespace string in sections selected by existing precedence: `summary` when that array is non-empty, otherwise `details` when that array is non-empty, otherwise `content`. Put section selection and text detection in one focused helper used by chat filtering and `ReasoningEvent`, so visibility and rendered content cannot disagree.
- Change `ActionConversationChat` filtering only for `completed` reasoning: keep entries with displayable text and continue hiding entries without it. Preserve visibility of running, failed, declined, and other non-completed reasoning.
- Render retained completed reasoning as one collapsed block. Keep its header, `Completed` status, and an accessible expand/collapse button visible; render selected text only while expanded. Collapse both a reasoning block that completes while mounted and completed reasoning loaded from history. Unrelated updates to that completed event must not close it again after user expands it.
- Keep live reasoning expanded with current section boundaries, colors, ordering, and wrapping. Keep failed and declined reasoning presentation unchanged.
- Treat retained completed reasoning as a visible transcript boundary, so completed tool calls on opposite sides form separate groups. Textless completed reasoning remains filtered and therefore does not divide adjacent tool calls. Existing chat reservation logic then sees retained reasoning as a visible non-running group and releases its consumed running slot.
- No desktop normalization, conversation schema, persistence, or canonical entry changes are required. Add focused component tests for text detection, lifecycle collapse, history rendering, toggling, grouping boundaries, and accessibility.

## acceptance criteria

- Reasoning with status `inProgress`, `running`, or `started` remains visible and expanded while its text streams.
- When reasoning with displayable text becomes `completed`, its text collapses while one visible header remains at the same transcript position.
- User can expand that completed block to read all selected sections and collapse it again. Control reports its state through `aria-expanded` and works by keyboard.
- Completed reasoning loaded from an existing conversation starts collapsed and remains expandable.
- Completed reasoning whose selected sections contain no non-whitespace text is absent. This includes missing fields, empty arrays, empty strings, and whitespace-only strings.
- `summary`, `details`, and `content` retain current selection precedence and section order. Long lines retain current wrapping.
- Failed and declined reasoning remains visible with its current error state. Other event visibility and status labels remain unchanged.
- Retained completed reasoning divides completed tool-call groups at its transcript position; hidden textless reasoning does not. Conversation entry data and order remain unchanged.
- Focused chat and reasoning-event tests pass for live completion, historical completion, each text source, whitespace-only content, expand/collapse interaction, error states, and tool-group boundaries.
