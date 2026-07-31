---
author:
id: B_81
internalId: 8e4a295a-8788-4232-8be7-c97f5a1cf5c8
title: new card Markdown typing lag
status: ready
owner:
affects:
agents:
policy:
after: 
---

## Problem

Typing in the **New card** description editor has noticeable input lag.

Performance trace `Trace-20260731T140458.json` records five input events that each block the renderer main thread for 52-64 ms. Layout and paint are small; synchronous React work consumes most of the time.

## Cause

`NewCardDialog` passes `handleBodyChange` to `MarkdownEditor.onLiveChange`. Every editor change calls `setBody`, rerendering the complete dialog and the MDXEditor subtree. This also recreates the Markdown editor plugin array and many MUI elements and style objects. Development-mode React work and garbage collection amplify the cost.

This bypasses the lifetime-stable editor approach already used by `CardEditor` and `CardBodyEditor`. `MarkdownEditor` already buffers local edits and exposes `getMarkdown`, `setMarkdown`, and `flush`; normal typing does not need to propagate the full body into parent React state.

## Required change

- Keep the new-card Markdown editor lifetime-stable while typing, following `CardEditor` and `CardBodyEditor`.
- Do not store the full Markdown body in `NewCardDialog` state on every keystroke.
- Read the current body from the editor when submitting, checking whether the draft is dirty, and inserting or clearing the template.
- Preserve existing template behavior: untouched template can be cleared; editing it changes the action back to `Template`; inserting then appends without discarding text.
- Keep reset, cancel confirmation, `Ctrl+Enter`, and target-column behavior unchanged.
- Do not change shared `MarkdownEditor` buffering semantics solely for this dialog.

## Acceptance criteria

- [ ] Typing in the new-card description does not rerender `NewCardDialog` or remount/rerender the Markdown editor for every keystroke.
- [ ] Submitted card body exactly matches current editor content.
- [ ] Cancel confirmation detects description-only edits.
- [ ] Template insert, clear, edit, and append behavior remains unchanged.
- [ ] Opening, closing, successful creation, and project changes reset the draft correctly.
- [ ] A regression test verifies repeated description edits do not repeatedly render the editor boundary.
- [ ] Existing new-card dialog and Markdown editor tests pass.
