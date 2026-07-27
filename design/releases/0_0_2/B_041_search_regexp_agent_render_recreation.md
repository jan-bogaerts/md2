---
id: B-041
title: search regexp agent is re-created on every MainWindow render
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: d0f80651-926c-42bc-a898-2c3e1d910b7b
---

## Problem
`MainWindow` (`app/src/components/shell/main_window.tsx`) computes `const regexpAgent = isSearchRegexpAgentAvailable() ? createSearchRegexpAgent() : undefined` directly in the render body. Every render (menu open/close, status text edit, media query change) creates a new agent function and passes a new prop identity to `SearchControl`, defeating any memoization downstream and re-running the availability check on each render. It is also the render-time-service-read pattern that B-031 removed elsewhere: availability depends on the action bridge, which is not a render-stable source.

## Fix
- Wrap creation in `useMemo(() => (isSearchRegexpAgentAvailable() ? createSearchRegexpAgent() : undefined), [])` — or, if availability can change at runtime (remote-control connect/disconnect), subscribe via a small `useSyncExternalStore` hook consistent with B-031's hooks and memo on that value.
- No behavior change intended beyond stable identity.

## acceptance criteria
- `createSearchRegexpAgent` is called at most once per availability state, not per render (assertable with a spy in a component test).
- Search and the agent-regexp button behave exactly as before in both web and Electron modes.

## see also
- `design\feature_descriptions\ready\B_031_render_time_service_reads.md`
- `design\feature_descriptions\ready\F_029_search_regexp_agent.md`
