---
author: 
id: F_200
internalId: cc3a9c43-319b-4a60-a202-f728f220e14e
title: Search results highlight text
status: ready
owner: 
affects:
agents:
  - design/releases/0_4_0/card__cc3a9c43-319b-4a60-a202-f728f220e14e.json
policy:
---

In the global search we show the list of search results with for each result, some text where the search term was found. We should highlight this text so its easy to see where the result is.

## Current state

Search (F_017) is complete. `search_project.ts` produces `SearchMatch` objects where `context` is a plain-text snippet (±40 characters around the match, whitespace-normalized via `.replace(/\s+/gu, ' ').trim()`). `buildContext` returns only the string — the match offset within the snippet is not preserved. `search_results.tsx` renders `match.context` as the `secondary` string of `ListItemText` with no visual distinction of the matched portion. The same applies to `ActionSearchMatch.context`. `SearchPanel` already owns `query` and `mode` state but does not pass them to `SearchResults`.

## Implementation details

- Add `query: string` and `mode: SearchMode` props to `SearchResults` (`app/src/components/shell/search/search_results.tsx`).
- In `renderMatch`, re-locate the match within `match.context` at render time: use case-insensitive `String.indexOf` for text mode, `RegExp.exec` for regexp mode. Split the context into three segments — before, matched, after — and render as `<span>before<mark>matched</mark>after</span>`. Style the `<mark>` element with a MUI `sx` prop (e.g. `bgcolor: 'warning.light'`, `color: 'warning.contrastText'`, `borderRadius: 0.25`).
- Apply the same highlighting in `renderActionMatch` for `match.context`.
- In `SearchPanel` (`app/src/components/shell/search/search_panel.tsx`), pass `query={query}` and `mode={mode}` to `<SearchResults />` at the call site on line 283.
- If the match cannot be re-located in the context (regexp matched across whitespace that `buildContext` normalized away), fall back to rendering plain text without throwing.
- No changes to `SearchMatch`, `ActionSearchMatch`, `search_types.ts`, or `search_project.ts`.
- No new files: all changes are in `search_results.tsx` and `search_panel.tsx`.

## Acceptance criteria

- The matched substring inside each card result's context snippet is visually highlighted (distinct background color, same font size) for both text and regexp modes.
- Non-matched text before and after the highlight renders as plain text.
- When the match cannot be re-located in the context string (whitespace normalization edge case), the context renders as plain text without error.
- Action results (`ActionSearchMatch.context`) also highlight the matched text.
- `SearchResults` accepts `query` and `mode` props; `SearchPanel` passes them.
- No changes to `SearchMatch` or `ActionSearchMatch` types.
