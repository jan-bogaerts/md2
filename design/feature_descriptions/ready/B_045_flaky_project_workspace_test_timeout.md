---
id: B-045
title: flaky ProjectWorkspace test times out under full-suite load
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`ProjectWorkspace > creates job and bug cards with the type-specific id prefix` (`app/src/components/project_workspace.test.tsx:373`) fails with `Test timed out in 5000ms` when the full suite runs (`npm test`, threads pool), but passes when the file runs alone. Reproduced twice in a row on 2026-07-08 (606/607 passing both times). The suite's environment/setup cost under parallel threads (~250s cumulative environment time) starves this test past the default 5s `testTimeout`, so main reports a red suite intermittently even though nothing is functionally wrong.

## Fix
Prefer making the test cheaper over raising timeouts: check whether it renders the full `ProjectWorkspace` and creates two cards sequentially where a tighter arrangement (single render, pre-seeded bridge) would do. If the cost is inherent, give this test (or the file's `describe`) an explicit larger timeout with a comment naming the parallel-load constraint. Avoid raising the global `testTimeout`.

## acceptance criteria
- Three consecutive full `npm test` runs pass with no timeout in `project_workspace.test.tsx`.
- The global vitest `testTimeout` is unchanged.

## see also
- `design\feature_descriptions\ready\J_014_split_data_service_tests.md`
