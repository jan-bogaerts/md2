---
author: 
id: F_457
internalId: 2abaa832-8652-4464-aca4-963549cdbac2
title: add replace to search
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__2abaa832-8652-4464-aca4-963549cdbac2.json
policy:
after: ac32ed09-2e05-4ae3-9a90-8a03bba61616
---
In the markdown editor, we have a local search function. We should also include a `replace` feature. So the text that was searched for, can be replaced.

* activated through shortcut ctrl+h. this opens the search box expanded so it also contains the `replace` input
* or if the search box is already open, through a dropdown icon, in front of the search text. when expanded, the user can enter the text that needs to replace the selection.
* user can replace selected text or all at once. there should be a button for this

## Current state

`MarkdownEditor` installs `MarkdownLocalTextSearchPlugin` by default. The action-prompt editor opts out because its containing popup owns `Ctrl+F`. Source mode also hides the local visible-text search control. Toolbarless and read-only rich-text editors keep search through `Ctrl+F`.

The plugin opens a non-blocking popup, submits search only on `Enter` or the Search button, and stores submitted term and case mode separately from draft input. It selects next or previous non-overlapping visible-text match, wraps at document boundaries, reports total matches, and supports matches spanning adjacent Lexical text nodes. Search changes selection only; it does not change Markdown, dirty state, history, or persistence.

No replace input, `Ctrl+H` handler, replacement action, or read-only replacement guard exists. Normal Lexical edits already flow through `MarkdownEditor.handleEditorChange` into draft or data-source editing, dirty state, document history, and existing commit behavior.

## Implementation details

* Define **current match** as match selected by last submitted search or later result navigation. Define **Replace all** as replacing every non-overlapping match present when action starts. Replacement text is literal text and is not searched again during same action; an empty replacement is allowed and deletes matches.
* Add an expand/collapse chevron before search field. This is an expansion control, not a menu. Expanded popup adds replacement input plus accessible `Replace` and `Replace all` buttons. Keep existing find controls and non-blocking `Popper` placement.
* Register `Ctrl+H` in editor-local Lexical keyboard handling. Prevent browser history, open popup expanded, preserve selected-text search seeding, and focus search input. `Ctrl+F` and toolbar search button continue opening find-only state.
* Keep draft find term, submitted find term, replacement text, and current match as separate plugin state. Typing either input must not navigate, replace, or change active result count. Search submission remains required before replacement.
* Extend local-search helper with editor operations that replace current matched Lexical range and all current matches, including matches spanning adjacent text nodes. `Replace all` must process initial matches from document end toward start in one editor update so offset changes cannot skip later matches and one undo restores whole action.
* `Replace` changes only current match, then recalculates remaining count and selects next match from end of inserted text, wrapping when needed. Disable replacement actions when no submitted term exists, no current match exists for `Replace`, or editor is read-only. `Replace all` with zero matches leaves document unchanged.
* Pass `readOnly` through local-search plugin configuration. Read-only editors retain find behavior; expanded replacement fields may be viewed, but mutation buttons remain disabled and no edit occurs.
* Let Lexical updates use existing `MarkdownEditor` change flow. Do not call persistence, dirty-state callbacks, or history stores directly. Successful replacement must serialize Markdown, mark editable document dirty, update its draft or data source, and enter normal undo history.
* Keep case matching, result navigation, selected-text seeding, hidden-toolbar support, overlay ownership, Escape handling, action-prompt opt-out, file search, source mode, and desktop code unchanged.
* Add helper tests for single replacement, cross-node replacement, reverse-order replace-all, deletion, case mode, replacement containing search term, and zero matches. Extend editor tests for expansion controls, `Ctrl+H`, focus, button states, read-only behavior, dirty/data-source changes, result count, selection, and one-step undo for Replace all.

## Acceptance criteria

* `Ctrl+H` inside enabled rich-text Markdown editor prevents browser history and opens local-search popup expanded with focused search input.
* Chevron before search field expands and collapses replacement row. `Ctrl+F` and toolbar search button keep existing find-only opening behavior.
* Expanded row contains accessible replacement input, `Replace`, and `Replace all` controls.
* Typing find or replacement text does not move editor selection or edit document. User must submit find term before replacement actions become available.
* `Replace` changes only current match, updates remaining result count, and selects next remaining match with existing wrap behavior.
* `Replace all` changes every non-overlapping match present when action starts. It handles cross-node matches, does not process matches created by replacement text, and makes no change when count is zero.
* Match-case mode applies to both replacement actions. Empty replacement deletes selected matches.
* Successful replacement follows normal Markdown serialization, dirty-state, draft or data-source update, persistence, and undo flows. Replace all is one undoable action.
* Read-only editors keep search but cannot replace text. Disabled actions cause no Markdown, dirty-state, history, or persistence change.
* Existing next/previous navigation, `F3`, result count, Escape close, non-blocking interaction, sticky placement, hidden-toolbar support, overlay stacking, action-prompt opt-out, and source-mode behavior remain unchanged.
