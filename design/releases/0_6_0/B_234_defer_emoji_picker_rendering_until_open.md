---
author: 
id: B_234
title: Defer emoji picker rendering until open
status: ready
owner: 
affects:
policy:
changedFiles:
  - app/src/components/editor/markdown_emoji_picker_content.tsx
  - app/src/components/editor/markdown_emoji_toolbar_control.grouped.test.tsx
  - app/src/components/editor/markdown_emoji_toolbar_control.tsx
internalId: e635ff29-5c2e-40a2-9374-baa53708524f
after: 23d124ec-a23c-442f-af4d-f678be48084c
agents:
  - design/releases/0_6_0/card__e635ff29-5c2e-40a2-9374-baa53708524f.json
---

Opening a card constructs the complete emoji picker even though the picker is closed. Render and group the emoji catalogue only after the user opens the picker.

## Current state

* `MarkdownEmojiToolbarControl` is included by `MarkdownFormatToolbarControls`, which is shared by the card popup, list editor, action phrase editor, and default Markdown editor toolbar.
* Every render filters the 1,622-entry `EMOJIS` catalogue into groups and maps every visible entry to a MUI `ButtonBase`. The resulting picker tree is passed to a closed `Popover`; the popover does not mount that tree in the DOM, but the React elements have already been constructed.
* Opening a card mounts its Markdown editor and then rerenders `CardBodyEditor` when the popup overlay container changes from `null` to its `HTMLDivElement`. The closed emoji picker work therefore occurs during card opening and may occur more than once.
* `Trace-20260914T112630.json` records a 512 ms card-open interaction. The click spends 491 ms in renderer scripting, while style recalculation, layout, and paint together account for less than 16 ms. CPU stacks identify `MarkdownEmojiToolbarControl`, React's JSX development runtime, and `console.createTask` as the dominant path. Heap usage increases by about 21 MB and a 14 ms garbage collection occurs.
* The trace contains no `ProjectWorkspace`, `CardColumn`, `CardView`, or `CardViewContent` renders during the interaction. The board-wide rerender fixed by B_232 is no longer the cause.

## Implementation details

* Keep the `Insert emoji` toolbar button and its `anchorElement` state in `MarkdownEmojiToolbarControl`.
* Move the picker body and its filter state into `markdown_emoji_picker_content.tsx`. Render that component as the `Popover` content only while `anchorElement` is non-null. A closed picker must not filter, group, iterate, or create React elements for `EMOJIS`.
* Let unmounting the picker content reset its filter state. Reopening the picker starts with the complete, unfiltered catalogue, preserving the existing close behavior without retaining a hidden picker tree.
* Preserve the current MUI `Popover`, popup anchor, `overlayContainer`, labels, grouping order, case-insensitive name and keyword filtering, empty state, Unicode insertion command, editor refocus, and `dialogService` error reporting.
* Keep all four `MarkdownFormatToolbarControls` consumers unchanged. They should continue to receive the same editable/read-only behavior through the shared toolbar control.
* Do not change the emoji catalogue or introduce virtualization, pagination, recent-emoji state, dependencies, or persistence in this bug. Rendering all emoji after the user explicitly opens the picker remains valid.
* Update the focused toolbar-control tests to cover the closed state, opening, closing and reopening with a reset filter, filtering, insertion, disabled state, and `overlayContainer` placement. Run the related test file and app lint.

## Acceptance criteria

* Mounting an editable Markdown editor with the emoji picker closed does not filter, group, iterate, or construct picker items from `EMOJIS`.
* Opening a card does not render emoji group sections or emoji buttons unless the user opens `Insert emoji`.
* Clicking `Insert emoji` renders the existing grouped, searchable emoji picker and preserves insertion, focus, anchoring, overlay placement, empty-state, and error behavior.
* Closing the picker removes its content. Reopening it shows the unfiltered catalogue and an empty search field.
* Card popup, list, action phrase, and default Markdown editor toolbars retain the emoji button when editable and omit it when read-only.
* A repeat performance trace of opening the same card no longer attributes the card-open click to `MarkdownEmojiToolbarControl` or construction of the emoji catalogue.
* Focused tests and app lint pass without errors or warnings.
