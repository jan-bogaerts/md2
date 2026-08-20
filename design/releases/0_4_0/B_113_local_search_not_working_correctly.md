---
author: 
id: B_113
internalId: 332eb86e-d703-4707-a8de-0bdec67e23f5
title: local search not working correctly
status: ready
owner: 
affects:
agents:
  - design/releases/0_4_0/card__332eb86e-d703-4707-a8de-0bdec67e23f5.json
policy:
after: 5936b8d1-a0b9-4d53-9edf-e753e80796dd
---

we recently implemented local search in cards, see [F\_104\_add\_local\_text\_search\_md\_editor.md](design/releases/0_3_0/F_104_add_local_text_search_md_editor.md)

this is still broken. what happens: user types letter in search box, search starts, highlights first word and puts focus on editor, so user can no longer finish typing the search text. this is bad behavior. search should only start when user presses enter or clicks the search button, not after first letter has been typed.

## Current state

`MarkdownLocalTextSearchPlugin` stores popup state, search term, case mode, and search origin. An effect calls `selectMarkdownTextMatch` whenever the popup is open and the term or case mode changes. Each typed character therefore updates the Lexical selection. A successful selection focuses the editor, so the search field loses focus before the user can finish typing.

The popup contains a decorative search icon, not a clickable search control. Existing matching, wraparound, `F3`, selected-text seeding, read-only support, and `localTextSearch={false}` opt-out work independently of this trigger bug.

## Implementation details

* Define **submit search** as pressing `Enter` in the search field or clicking a new search icon button inside the popup.
* In `MarkdownLocalTextSearchPlugin`, keep draft term and case-mode changes limited to input state. Remove automatic match selection caused by those changes.
* Replace the decorative search adornment with an accessible `IconButton` using the existing outlined search icon, tooltip, and `aria-label`. Both button click and search-field `Enter` must call one shared submit handler.
* On submission, store complete draft term and case mode as active search values, then call existing `selectMarkdownTextMatch` with those values and captured search origin. Empty or missing terms must keep the editor selection unchanged.
* Keep `F3` next-match behavior after a submitted search, including wraparound. `F3` must use active search values, not an unsubmitted draft; before first valid submission it leaves editor selection unchanged.
* Keep popup opening, focus, Escape handling, selected-text seeding, case matching, cross-node matching, scrolling, read-only behavior, overlay placement, toolbar entry point, and action-prompt opt-out unchanged.
* Limit code changes to local-search popup behavior and its focused tests. No `MarkdownEditor` call site, search mapping utility, persistence flow, document history, file search, or desktop code requires changed behavior.
* Update `markdown_editor_local_text_search.test.tsx` so typing asserts search-field focus and unchanged editor selection until submission. Cover both `Enter` and popup-button submission, then run related UI tests and app unit tests.

## Acceptance criteria

* Typing one or more characters changes only search-field value. Search field retains focus, and editor selection does not move.
* Pressing `Enter` with a non-empty term starts search using complete term and selects first matching visible-text range from captured search origin, with existing wraparound behavior.
* Clicking popup search button performs same search as pressing `Enter`.
* Popup search button has tooltip and accessible name.
* Changing match-case mode does not start search. Next submitted search uses selected case mode.
* Empty or missing submitted term leaves editor selection unchanged and causes no error.
* `F3` selects next match with last submitted term and case mode and wraps after final match. Before first valid submission, `F3` leaves editor selection unchanged.
* Search still does not edit Markdown, mark document dirty, write persistence data, or add undo history.
* Existing toolbar button, `Ctrl+F`, selected-text seed, Escape close, hidden-toolbar and read-only support, overlay placement, and action-prompt opt-out remain unchanged.
