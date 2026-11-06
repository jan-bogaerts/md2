---
author: 
id: F_460
internalId: 408e6af2-abc8-4f00-b4a5-59b908b8256b
title: start search automatically after 1st letter
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__408e6af2-abc8-4f00-b4a5-59b908b8256b.json
policy:
after: 204e1fa2-8e5e-4fd1-b63c-06c9c762c080
branch: f_460_start_search_automatically_after_1st_letter
worktree: 3
---

all search components (global search and the local searches) currently work on the principle that the search starts after pressing enter.

We should improve this by starting the search after the first letter has been entered, but with a short delay, so that, while the user is typing, we wait, once he pauses, the search starts automatically. If he continues to type, we do the delay again until he stops typing so we can do the search again.

## Current state

Global project search in `app/src/components/shell/search/search_panel.tsx` already searches on every query change. It has no delay, so each keystroke searches active cards, background-card headers and enabled bodies, and enabled actions immediately. Empty input clears results immediately. Search-option changes and an agent-generated RegExp also run immediately. Invalid RegExp input keeps previous results and reports an error through `dialogService`.

Two local visible-text searches still separate draft input from submitted input and require `Enter` or the Search button:

* `MarkdownLocalTextSearchPlugin` searches visible rich-text editor content, selects and counts matches, supports next/previous navigation and case matching, and supplies submitted matches to replace actions.
* `ActionConversationSearchService` searches one mounted action-conversation transcript, owns submitted term, result count, active match, and DOM selection, and exposes controls through `ActionConversationSearchRow`.

Markdown `@` file search already filters its typeahead options as query text changes. It does not require `Enter` to start searching and is outside this change. Desktop code has no search timing responsibility.

## implementation details

* Define **debounce** as postponing a search until 800 ms has elapsed since latest query-input change. Every later change within that interval cancels previous pending search and starts a new 800 ms interval.
* Apply same 800 ms debounce to global project-search input, Markdown local visible-text input, and action-conversation local-search input. First eligible character schedules search; no minimum length beyond each search's existing non-empty-term rule is added.
* Keep `Enter` and Search button as immediate submission paths for both local searches. They cancel pending timer before running, so one user action cannot cause a duplicate search 800 ms later.
* Clear pending timer when query becomes empty, search UI closes, owning component or service is disposed, Markdown draft resets, or conversation transcript is unmounted. Empty input clears active/submitted search state and result count immediately; it must not wait 800 ms or run stale query later.
* Keep option changes immediate. Global RegExp, background-body, and action toggles rerun current query immediately. Local case toggle reruns current non-empty draft term immediately. These controls are deliberate commands, not typing pauses.
* Preserve current search origins and navigation: automatic local search selects first match from same origin used by current submission; next, previous, `F3`, wrapping, result count, and selected-text seeding keep current behavior.
* Preserve replace separation in Markdown search. Automatic search updates active term, active case mode, current match, and count after 800 ms, but never changes Markdown. `Replace` and `Replace all` continue using latest completed search, remain unavailable before one completes, and keep existing read-only guards and undo/persistence flow.
* Preserve global invalid-RegExp behavior: only latest debounced query is evaluated; invalid pattern keeps previous results and reports through `dialogService`. Agent-generated RegExp remains immediate because it follows an explicit agent action, not typing.
* Keep debounce ownership with each existing search owner. `SearchPanel` and `MarkdownLocalTextSearchPlugin` cancel their component timers during cleanup; `ActionConversationSearchService` owns and cancels its transcript-search timer. Do not add a service class or compatibility mode solely for timer handling.
* Update focused tests with fake timers. Cover cancellation and restart during typing, execution at 800 ms, immediate empty clearing, immediate `Enter`/button submission without later duplicate, cleanup cancellation, option changes, invalid RegExp handling, local navigation, and Markdown replacement state. Do not change file-search typeahead tests or desktop tests.

## acceptance criteria

* After first eligible query character is entered in global project search, Markdown local search, or action-conversation local search, no search runs before 800 ms; latest query runs when 800 ms passes without another input change.
* Each input change before 800 ms cancels prior pending search. Only latest query runs, once, 800 ms after final change.
* `Enter` or Search button in either local search runs current non-empty draft immediately and cancels pending automatic search, preventing delayed duplicate execution.
* Clearing query cancels pending work and clears results, count, and active/submitted search state immediately. Closing, resetting, unmounting, or changing transcript cannot run stale pending query.
* Global search still covers active cards, configured background content, and enabled actions. Global option toggles and successful agent-generated RegExp rerun immediately; invalid RegExp keeps previous results and reports error after debounce.
* Markdown and conversation searches still select from existing search origin, report count, wrap during next/previous navigation, honor case mode, support `F3`, and close through existing Escape behavior.
* Markdown automatic search never edits document. Replace controls use latest completed search and retain existing current-match, read-only, dirty-state, persistence, and undo behavior.
* Markdown `@` file-search typeahead and all desktop behavior remain unchanged.
