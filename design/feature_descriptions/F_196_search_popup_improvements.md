---
author: 
id: F_196
internalId: f1c69bfd-cfb3-40cd-8c1e-15e78f71f839
title: search popup improvements
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__f1c69bfd-cfb3-40cd-8c1e-15e78f71f839.json#conversation=agent-f2335844-7b36-4f5a-9e1c-918a540e187d
  - design/activity/card__f1c69bfd-cfb3-40cd-8c1e-15e78f71f839.json#conversation=agent-5cb838e4-4787-45ea-997a-88dacf343e66
  - design/activity/card__f1c69bfd-cfb3-40cd-8c1e-15e78f71f839.json#conversation=agent-f721f7b5-85e5-4665-bd28-0bfdd83b79db
policy:
branch: f_196_search_popup_improvements
worktree: 3
---

following improvements to the search popup:

* it blocks the underlying app, it should not be a blocking app, the rest of the app should remain working while the popup is open
  this one is important, I believe it is the cause of another issue: after search term has been entered and user presses enter, first result is selected, but there is no way to go to the next search result unless the search box is closed.
* add arrows up and down to move to previous and next search result in the text.
* include total count of results in doc

## Current state

`MarkdownLocalTextSearchPlugin` renders search UI in a MUI `Popover`. `Popover` uses `Modal`, so its backdrop intercepts pointer input, focus is kept inside popup, and page scrolling is locked. Editor selection can move to a match, but user cannot keep popup open while interacting normally with rest of app.

Search starts only when user presses `Enter` or clicks popup search button. Submitted term and case mode become active search values. `F3` selects next match and wraps to first match. Search works on flattened visible Lexical text, including matches spanning adjacent text nodes, without editing Markdown.

Popup has no previous-result control, next-result control, or total-result count. Existing helper finds one forward match from offset and wraps; it does not enumerate all matches or search backward.

## Implementation details

* Define **non-blocking popup** as search surface without modal backdrop, focus trap, or page-scroll lock. Replace `Popover` with anchored `Popper` and `Paper`, preserve editor-root anchoring and `overlayContainer`, and keep popup open while user interacts elsewhere. `Escape` must still close it after focus moves outside search field.
* Add accessible icon buttons with tooltips: up arrow selects previous match; down arrow selects next match. `F3` keeps same next-match behavior. Both directions wrap at document boundaries.
* Keep draft term and case mode separate from active submitted values. Typing or toggling match case must not navigate or replace displayed count. Submitting non-empty draft activates it, selects first match from captured search origin, and calculates total count.
* Extend `markdown_local_text_search.ts` to enumerate all non-overlapping matches in flattened visible text under selected case mode. Use ordered match ranges for total count and bidirectional navigation, including ranges spanning Lexical text nodes.
* Recompute ordered matches when search is submitted or navigation is requested, so count and selected result reflect current document text. A submitted term with no match produces zero results and leaves editor selection unchanged; empty submission keeps current active search unchanged.
* Display `1 result` or `<count> results` for active search. Before first valid submission, show no result count. Count covers whole document, independent of captured search origin.
* Keep toolbar and `Ctrl+F` entry points, auto-focus, selected-text seed, search submit button, match-case control, read-only support, action-prompt opt-out, and overlay stacking unchanged.
* Limit production changes to local-text search plugin and matching helper. Update helper unit tests for enumeration and reverse wrap; update editor tests for non-blocking interaction, arrow navigation, count, accessibility, and retained behavior. No Markdown editor call site, persistence flow, document history, file search, or desktop code needs changed behavior.

## Acceptance criteria

* While search popup remains open, user can focus, click, type in, and scroll rest of app. No invisible backdrop intercepts first interaction, no focus trap returns focus to popup, and no popup-owned scroll lock applies.
* `Escape` closes popup even after user moves focus outside search field.
* Submitting non-empty search selects first match at or after captured search origin, wrapping to document start when needed.
* Down-arrow button and `F3` select next match; after final match they wrap to first match.
* Up-arrow button selects previous match; before first match it wraps to final match.
* Arrow buttons have tooltips and accessible names that state `Previous result` and `Next result`.
* Active search displays total non-overlapping match count across whole visible document as `1 result` or `<count> results`. A submitted term with no match displays `0 results` without moving editor selection.
* Draft edits and match-case changes do not navigate or change active result count until user submits search. Submission and later navigation recalculate count from current document text.
* Matching remains case-aware, supports ranges across adjacent Lexical text nodes, and leaves selection unchanged when no match exists.
* Search navigation does not edit Markdown, mark document dirty, write persistence data, or add undo history.
* Existing toolbar button, `Ctrl+F`, selected-text seed, submit button, read-only and hidden-toolbar support, overlay placement, and action-prompt opt-out remain unchanged.
