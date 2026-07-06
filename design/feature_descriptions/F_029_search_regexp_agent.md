---
id: F-029
title: search regexp agent
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Wire the "ask agent to build a RegExp" search option (F-017) to a real agent execution path so a natural-language query can be converted into a regular expression and applied to the search.

## Current state
The UI flow is complete but the backend is a stub: `SearchControl` has the AutoFix button, busy state, error surfacing and query-preserving failure handling, but `defaultSearchRegexpAgent` (`app/src/services/search/search_project.ts`) always throws "RegExp agent is not available". There is no agent invocation behind it.

## implementation details
- Implement a `SearchRegexpAgent` backed by the desktop agent bridge: build a prompt asking the configured agent to return only a JavaScript-compatible regular expression for the user's description, run it via the existing agent execution path (`window.md2Actions.runAgent` / F-023 registry), and extract the expression from the output.
- Parse defensively: strip code fences/whitespace, validate with `new RegExp(...)` before returning; on invalid output, fail with a clear message (the UI already keeps the previous query on failure).
- Availability: the button stays enabled only when an agent bridge exists (Electron mode); in web mode keep the current "not available" error or hide the button.
- Inject the implementation where `SearchControl` is rendered (`MainWindow`), keeping the pure search module free of bridge imports.
- Register the run in the running-agents indicator like other agent runs.

## acceptance criteria
- In Electron mode with a configured agent, entering a description and pressing the agent button replaces the query with a valid RegExp, switches to RegExp mode and shows matching results.
- Invalid agent output or agent failure shows an error and leaves the current query and results unchanged.
- In web mode the feature is clearly unavailable rather than silently broken.
- Tests cover expression extraction/validation, failure handling and the availability gate.

## see also
- `design\feature_descriptions\F_017_search.md`
- `design\architecture\initial description\search.md`
