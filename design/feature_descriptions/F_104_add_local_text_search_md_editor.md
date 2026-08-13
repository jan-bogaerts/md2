---
author: 
id: F_104
internalId: d47986a5-1380-4dd1-adb9-fff106a9a143
title: add local text search md editor
status: ready
owner: 
affects:
agents:
  - design/activity/card__d47986a5-1380-4dd1-adb9-fff106a9a143.json#conversation=agent-b10ebe9e-02b2-405f-8aca-d5ad93e95550
  - design/activity/card__d47986a5-1380-4dd1-adb9-fff106a9a143.json#conversation=agent-34cfdb60-9142-435a-868d-42d6adadaa41
policy:
after: 56f68e51-66b5-4b47-9cf2-6a47128a0cb6
---
Add local text search to the markdown editor so that it becomes available in all components that use the markdown editor.

The toolbar should contain a search button which opens a small popup where the search term can be entered.

Ctrl+F also opens the search popup.

When the search popup opens, and some text it selected in the markdown editor, use that as default search value.

when search starts, select the first result down from the cursor. `F3` goes to the next search value

## Current state

`MarkdownEditor` wraps MDXEditor and its Lexical editing surface. It has no local-text search state, popup, toolbar control, or keyboard command. Existing visible toolbar variants all compose `MarkdownFormatToolbarControls`, while the new-card editor, action prompt, and read-only diff hide the toolbar.

Lexical already owns rendered document text and selection. `MDXEditorMethods.getSelectionMarkdown()` returns serialized Markdown, so it is unsuitable for a plain-text search seed: selected bold text can include Markdown delimiters. Existing realm plugins show how to install a Lexical composer child and register `KEY_DOWN_COMMAND`. `overlayContainer` already keeps editor-owned popups above dialogs and popovers.

## Implementation details

* Define **local text search** as matching visible plain text in one `MarkdownEditor`; it does not search Markdown syntax, other editors, files, or the action conversation log.
* Add an editor-local Lexical search plugin. Register `Ctrl+F` to open the search popup and prevent the browser find dialog. Add a search icon button with tooltip and accessible label to `MarkdownFormatToolbarControls`; dispatch the same open command from every visible shared toolbar.
* Render a small MUI popup for the active editor, using `overlayContainer` when supplied. Include an auto-focused search field and a toggle button that selects case-insensitive or case-sensitive matching. Default to case-insensitive. Escape closes the popup.
* When opening with a non-empty Lexical range selection, seed the field from `selection.getTextContent()`, meaning rendered plain text without Markdown delimiters. Otherwise retain the editor-local search term; first open starts empty.
* Search as the term changes. Starting from the current Lexical cursor or selection end, select the first matching text range later in document order. If none exists below, wrap once to document start. `F3` selects next match and wraps after last match. Empty terms and terms with no match do not change editor selection.
* Match across adjacent Lexical text nodes by mapping offsets in flattened plain text back to Lexical range endpoints. Search changes only selection and scroll position; it must not edit Markdown, mark document dirty, enter undo history, or flush data.
* Keep search enabled when `hideToolbar` is true for new-card and read-only diff editors, so `Ctrl+F` still opens popup without toolbar button. Add explicit opt-out on `MarkdownEditor` and use it for action-prompt editor; its containing action popup will later own `Ctrl+F` search across conversation log.
* Keep file `@` search, placeholder search, paste handling, document history, formatting controls, editor bindings, and desktop backend unchanged.
* Add focused tests for search matching and offset mapping, plugin shortcuts and wrap behavior, toolbar and hidden-toolbar entry points, selected-text seeding, case mode, no-match behavior, read-only use, and action-prompt opt-out. Extend MDXEditor/Lexical test stubs only as required for public editor behavior.

## Acceptance criteria

* Search button appears in every visible shared Markdown toolbar and opens that editor's search popup.
* `Ctrl+F` opens search in regular editors, new-card editor, and read-only diff, including editors without toolbar. Browser find does not open when editor search handles shortcut.
* Action-prompt editor does not handle `Ctrl+F`, leaving shortcut available for later action-log search.
* Opening search with selected rendered text places that plain text in focused search field. Markdown formatting delimiters are not included.
* Search defaults to case-insensitive. Toggle visibly and accessibly switches case sensitivity, and current term is reevaluated under selected mode.
* Entering term selects first match after current cursor or selection. Search wraps from document end to start when needed.
* `F3` selects following match and wraps from last match to first.
* Empty term or missing match leaves document selection unchanged and causes no error.
* Selected match can span Lexical text nodes. Match is scrolled into view without changing document content.
* Searching editable or read-only content causes no Markdown change, dirty-state change, persistence write, or undo-history entry.
* Popup stacks correctly inside page, dialog, and card-popover editor hosts; Escape closes it.
