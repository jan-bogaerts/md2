---
author: 
id: F_413
internalId: d013f56f-5326-4d88-b1c8-333ed3cbe3c7
title: column widths in read-only md in chatlog
status: ready
owner: 
affects:
agents:
  - design/activity/card__d013f56f-5326-4d88-b1c8-333ed3cbe3c7.json
policy:
branch: f_413_column_widths_in_read_only_md_in_chatlog
worktree: 1
changedFiles:
  - app/src/components/actions/conversation/messages/action_conversation_message.test.tsx
  - app/src/components/actions/conversation/messages/action_conversation_message.tsx
  - app/src/components/actions/conversation/messages/action_conversation_table.test.tsx
  - app/src/components/actions/conversation/messages/action_conversation_table.tsx
---

We show the chatlog in the action-popup's. these chatlogs show read-only markdown, formatted.

For tables however, we seem to use strange column widths. the last column is always super wide the first ones, very narrow. why is this, how can we improve?

## Current state

* `ActionConversationMessage` (`app/src/components/actions/conversation/messages/action_conversation_message.tsx`) renders message content with `ReactMarkdown` + `remarkGfm` inside a bubble `Box`. Only `a` and `pre` have custom components (`MARKDOWN_COMPONENTS`); GFM tables render as plain `<table>`.
* Bubble `Box` sets `overflowWrap: 'anywhere'` so long tokens (paths, URLs) wrap. All descendants inherit it, including `<td>`/`<th>`.
* Table styling comes only from `buildMarkdownContentSx` (`app/src/components/editor/markdown_style_sx.ts`): typography + spacing. No width, layout, or overflow rules.
* Bubble width: `maxWidth: '88%'`, shrink-to-fit (`alignSelf` flex-start/flex-end).

### Cause

* Browser auto table layout gives each column at least its *min-content width* (narrowest width a cell can take without overflow) and splits remaining space by each column's *max-content width* (width of cell text on one line).
* `overflow-wrap: anywhere` allows a break between any two characters and, unlike `break-word`, counts those breaks for min-content. So every cell's min-content width drops to about one character.
* When table text is wider than the bubble, short columns (ids, status, names) shrink to near one character and wrap mid-word. Long-text column (usually last, e.g. description) takes most of the space.

## Implementation details

1. New component `ActionConversationTable` in own file `app/src/components/actions/conversation/messages/action_conversation_table.tsx`, same pattern as `ActionConversationCodeBlock`:
   * Renders `Box` wrapper with `maxWidth: '100%'`, `minWidth: 0`, `overflowX: 'auto'`, then `<table>` with received `children`.
   * Wrapper scrolls wide tables horizontally inside the bubble; chat viewport stays `overflowX: 'hidden'`.
2. Register in `MARKDOWN_COMPONENTS`: `{ a: ActionConversationLink, pre: ActionConversationCodeBlock, table: ActionConversationTable }`.
3. In wrapper `sx`, set `'& th, & td': { overflowWrap: 'break-word' }`. Result: cell min-content = longest word, so short columns keep whole words; single tokens wider than table still break instead of overflowing.
4. Bubble `overflowWrap: 'anywhere'` unchanged: still needed for paragraphs and long paths outside tables.
5. No change to `buildMarkdownContentSx`: it is shared with MDXEditor and markdown style preview, which do not inherit `overflow-wrap: anywhere`.

### Edge cases

* Table narrower than bubble: no scrollbar, layout identical to max-content.
* Very long unbroken token in cell (path, URL): word-level min-content makes table wider than bubble → horizontal scroll inside wrapper, not mid-word wrap of other columns.
* Streaming/queued content (`delivery.content`): same renderer, no special handling.

### Tests

* Add `action_conversation_table.test.tsx`: renders GFM table through message markdown; assert table role present, wrapper has `overflowX: 'auto'`, cells have `overflowWrap: 'break-word'`.
* Existing test `keeps vertical scrolling on the chat viewport and wraps long message tokens` (`action_conversation_chat.grouped.test.tsx`) must still pass unchanged.

## Acceptance criteria

* Table in chatlog message: short columns show whole words, no mid-word wrapping when bubble has room for longest word per column.
* Long-text columns wrap at word boundaries.
* Table wider than bubble scrolls horizontally inside message; chat viewport never scrolls horizontally.
* Non-table message text (long paths, URLs) still wraps as before.
* Card editor and markdown style preview table rendering unchanged.
* Table stays accessible as `table` role with header and cells.