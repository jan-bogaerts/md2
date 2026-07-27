---
id: B-040
title: background full-project load fails silently
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: afc8a2ad-360c-4ca1-b95e-c12f9b8bcc0f
---

## Problem
`ProjectLoading.loadFullProjectInBackground` (`app/src/services/project_loading.ts`) wraps the whole background phase — full project load, repository file listing, external card import merge — in a catch that only does `console.error`. When it fails (network drop on GitHub, revoked token mid-session, bridge error), the app keeps running on the root-only snapshot: history/architecture cards never load, search over special folders silently returns nothing, `repositoryFiles` stays empty so the affects editor has no suggestions. The user gets no signal that they are working with partial data. This contradicts the B-024 policy that errors surface through the workspace notice + telemetry path.

## Fix
- In the catch, report through the existing channels: `reportWorkspaceError` (or a dedicated notice like "Background project data failed to load — search and history may be incomplete") and `telemetryService.captureError`.
- Distinguish cancellation from failure: token-mismatch/`shouldApplyProjectLoad` early returns are normal and must stay silent; only real exceptions report.
- Consider a retry affordance: the notice can suggest reopening the project, or the workspace can expose a "reload" action; a single automatic retry with backoff is acceptable but keep it simple.

## acceptance criteria
- A failing `loadProject`/`listRepositoryFiles` in the background phase produces a visible workspace error and a captured telemetry error; the root snapshot keeps working.
- Project switches that invalidate an in-flight background load stay silent.
- Tests cover both: failure reports, superseded load does not.

## see also
- `design\feature_descriptions\ready\B_024_swallowed_errors.md`
- `design\feature_descriptions\ready\B_010_blocking_project_load.md`
