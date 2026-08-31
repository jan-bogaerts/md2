---
author: 
id: F_218
internalId: 07585a70-9a56-42b6-a98c-a64de9d68995
title: add shortcut to copy as text
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__07585a70-9a56-42b6-a98c-a64de9d68995.json
policy:
after: 8021d46c-cb31-4111-9385-9789a43c6c71
---
shortcut: shift + ctrl + c



also: currently, when copying as markdown, we always seem to take the full line, not the selected text. this also needs to be fixed

Terms used below:

- **copy as markdown**: the default copy behavior in the Markdown editor. It writes the selection to the clipboard as Markdown source, on both the `text/markdown` and `text/plain` clipboard flavors.
- **copy as text**: the alternative copy behavior. It writes the selection to the clipboard as plain text with no Markdown syntax, on the `text/plain` flavor only.
- **entry point**: a way for the user to start an operation, such as a keyboard shortcut or a context menu item. Several entry points can share one implementation.
- **export visitor**: an MDXEditor mechanism that converts one Lexical node type into its Markdown representation. The set of registered visitors is what turns the editor document into the file content on save.
- **block expansion**: enlarging a selection to the full block that contains it (paragraph, heading, list item or quote) before serializing it.

## Current state

### The shortcut already works, but nothing advertises it

`MarkdownPastePlugin` (`app/src/components/editor/markdown_paste_plugin.tsx:52`) already implements Ctrl+Shift+C. It works in two steps, because a Lexical `COPY_COMMAND` event does not carry the modifier keys that produced it:

1. The `KEY_DOWN_COMMAND` handler at line 60 sees Ctrl+C and records whether Shift was held into `copyIntentRef`. `trackShortcutIntent` (line 25) clears that flag again on the next macrotask, so a Ctrl+Shift+C that never produces a copy event does not leak its intent into a later copy.
2. The `COPY_COMMAND` handler `handleCopy` (line 66) consumes the flag. When Shift was held it writes `selection.getTextContent()` to `text/plain` and nothing to `text/markdown` (lines 75-77). Otherwise it writes the Markdown serialization to both flavors (lines 78-81).

So the requested shortcut exists. What is missing is discoverability: no toolbar, menu or tooltip anywhere in the product states that Ctrl+Shift+C copies as text.

### Copy as text is implemented twice

The desktop context menu has its own, unrelated implementation. `buildEditingMenuSection` (`desktop/src/shell/text_context_menu.js:16`) builds a `Copy as Text` item whose click handler runs `clipboard.writeText(params.selectionText)` in the Electron main process. It never reaches the renderer, and therefore never reaches `handleCopy`.

The two implementations read the selection from different places. The renderer path uses Lexical's `selection.getTextContent()`; the main-process path uses `params.selectionText`, which is Chromium's own serialization of the DOM selection, handed to the main process on the `context-menu` event. They agree on a simple run of inline text and can differ wherever the two serializations differ, such as how blocks are joined and whether list markers are included.

Note that plain **copy** does not have this problem. The context menu's `{ role: 'copy' }` (line 25) invokes Chromium's native copy, which dispatches a DOM copy event in the renderer, which Lexical turns into `COPY_COMMAND`, which lands in `handleCopy`. Copy therefore already has one implementation behind two entry points. Copy as text is the outlier.

The `Copy as Text` item also carries no `accelerator` field, so Electron renders its label bare while the neighboring `role`-based Cut, Copy and Paste items display their native shortcuts. This is the concrete reason the shortcut is undiscoverable.

### Copy as markdown expands the selection to whole blocks

`handleCopy` obtains its Markdown from `config.getSelectionMarkdown()`, which is wired in `markdown_editor.tsx:310` to `MDXEditorMethods.getSelectionMarkdown`, which calls `getSelectionAsMarkdown` in the installed MDXEditor build (`app/node_modules/@mdxeditor/editor/dist/utils/lexicalHelpers.js`).

That function is the cause of the reported bug. It takes `selection.getNodes()`, then for each node walks **up** the tree to the nearest heading, list item, paragraph or quote ancestor and collects those ancestors into a set. It then serializes each collected ancestor in full. The text offsets of the selection are never consulted. Selecting three words inside a paragraph therefore yields the entire paragraph — exactly the "always takes the full line" symptom.

The same function has a second defect that matters once we touch this area. It is a hand-written serializer that recognizes only headings, lists, text formatting and links. It does not use the registered export visitors, so code blocks, images, tables and thematic breaks inside a selection degrade to their bare text content and lose their Markdown syntax.

## Implementation details

### 1. Upgrade MDXEditor and use its selection serializer

Upgrade `@mdxeditor/editor` to `4.2.x` and align the app's direct Lexical dependencies with the version used by MDXEditor. Version 4.2 fixes partial selection serialization in `MDXEditorMethods.getSelectionMarkdown`: it trims nodes to the selection boundaries and runs them through the configured Markdown export visitors.

Keep `MarkdownPasteConfig.getSelectionMarkdown` supplied by `MarkdownEditor` and use it from `MarkdownPastePlugin`. Do not maintain a separate selection-to-Markdown serializer in the app.

### 2. Collapse copy as text onto one implementation

The renderer becomes the only place that produces copy-as-text content, and the main process stops touching the clipboard for this item.

- Extract the plain-text production into a single function in the clipboard plugin, used by both entry points. The shifted branch of `handleCopy` calls it instead of inlining `selection.getTextContent()`.
- Add a main-to-renderer channel, `md2-clipboard:copy-as-text`, to `desktop/src/shell/ipc_channels.js` and to `desktop/src/shell/preload.js`. Expose it as `window.md2Clipboard.onCopyAsTextRequested(callback)`, following the existing `md2Lifecycle.onFlushRequested` pattern at `preload.js:216-224`, which returns an unsubscribe function. Declare the bridge type on the renderer side the way `app/src/services/electron_lifecycle_bridge.ts:18` declares `md2Lifecycle`.
- Change the `Copy as Text` item in `buildEditingMenuSection` to send on that channel instead of writing the clipboard. The function's `clipboard` dependency is then unused and is removed from its signature, from `buildTextContextMenuTemplate`, and from the `registerTextContextMenu` options passed at `desktop/main.js:292`. Keep the `enabled: canCopyAsText` computation as it is — reading `params.selectionText` to decide whether the item is clickable is not a second copy implementation, it is menu state.
- Register the renderer listener from `MarkdownPastePlugin`, so it is scoped to a mounted editor and torn down with it, alongside the existing command registrations at line 128. The listener calls the shared function and writes the result with `navigator.clipboard.writeText`. The write mechanism necessarily differs between the two entry points, because the IPC path has no `ClipboardEvent` and therefore no `clipboardData` to populate; what is shared, and what the duplication was actually about, is the function that decides what the text is.
- Carry `params.selectionText`, captured when the context menu opens, with the renderer request. Use it when the request did not originate from the focused Markdown editor. This preserves copy as text for plain inputs and non-editor text.

There is one behavior to verify during implementation rather than assume: opening a context menu moves focus, so the implementation must confirm that Lexical's editor-state selection still describes the intended range when the IPC message arrives after the menu item is clicked. If it does not, the request must carry the selection captured at `context-menu` time instead of re-reading it on arrival.

### 3. Advertise the shortcut in the context menu

Add `accelerator: 'CommandOrControl+Shift+C'` and `registerAccelerator: false` to the `Copy as Text` item.

`registerAccelerator: false` is required, not cosmetic. With the default of `true`, Electron binds the key combination at menu level in addition to drawing the hint. The keystroke would then be handled by the menu item and by the renderer's existing `KEY_DOWN_COMMAND` and `COPY_COMMAND` handlers, copying twice for one press. With it set to `false`, Electron only renders the hint text and the renderer keeps sole ownership of the keystroke.

## Acceptance criteria

- Selecting part of a paragraph and pressing Ctrl+C puts only the selected span on the clipboard, as Markdown, on both `text/markdown` and `text/plain`. The surrounding text of that paragraph is not included.
- A selection that spans a code block, an image, a table or a thematic break serializes those constructs with their Markdown syntax intact, matching how the same content is written to file.
- Selecting part of a paragraph and pressing Ctrl+Shift+C puts only the selected span on the clipboard, as plain text, on `text/plain` only, with nothing written to `text/markdown`.
- A collapsed selection leaves the clipboard unchanged for both Ctrl+C and Ctrl+Shift+C.
- The desktop context menu shows `Copy as Text` with the shortcut `Ctrl+Shift+C` displayed next to it.
- Pressing Ctrl+Shift+C while the context menu accelerator is registered copies the selection exactly once.
- Choosing `Copy as Text` from the context menu and pressing Ctrl+Shift+C on the same selection produce byte-identical clipboard content.
- No code in `desktop/` writes the clipboard for `Copy as Text`. `text_context_menu.js` no longer takes a `clipboard` dependency, and `buildEditingMenuSection` no longer throws its clipboard-missing error.
- `Copy as Text` still works when the context menu is opened over text outside the Markdown editor, such as a plain input field.
- `MDXEditorMethods.getSelectionMarkdown` is the only selection-to-Markdown implementation. No app-owned Markdown export pipeline or `selectedMarkdown` test heuristic remains.
- `npm run typecheck` passes, and the existing clipboard tests in `app/src/components/editor/markdown_editor.test.tsx` and `desktop/src/shell/text_context_menu.test.mjs` pass after being updated to the new wiring.
