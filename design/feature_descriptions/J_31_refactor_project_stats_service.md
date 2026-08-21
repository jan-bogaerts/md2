---
author:
id: J_31
internalId: b7885271-1cd8-4927-9f68-661c0d87a61f
title: refactor ProjectStatsService into focused modules
status: design
owner:
affects:
policy:
branch: j_31_refactor_projectstatsservice_into_focused_modules
worktree: 2
agents:
  - design/activity/card__b7885271-1cd8-4927-9f68-661c0d87a61f.json
after: a2f851ba-744e-4b53-bc9b-33e1eaa6787a
---

`app/src/services/stats/project_stats_service.ts` combines source discovery, released-stat caching, session state, control reconciliation, time bucketing, four dataset aggregators, and presentation metadata. Split it without changing behavior.

## Current call sites

* `project_loading.ts`: bind and clear project state; keep current behavior.
* `stats_view.tsx`: open and close one viewing session; keep current behavior.
* `stats_content.tsx`: subscribe to snapshots; keep current behavior.
* `stats_controls.tsx`: update controls; keep current behavior.
* Chart and CSV components: import snapshot/row types; move imports to a dedicated types module.
* Service and component tests: preserve public behavior and coverage.

No verified call site needs different service behavior. Do not add modes or compatibility flags.

## Refactor

* Keep `ProjectStatsService` responsible only for lifecycle, binding, loading coordination, control updates, snapshot publication, and `EventTarget` notifications.
* Move public stats types and constants to `project_stats_types.ts`.
* Move UTC range/bucket logic to pure `stats_time_buckets.ts` functions.
* Move activity, performance, usage-comparison, and totals aggregation into separate pure dataset modules.
* Move source discovery, released-stat cache loading, and cache persistence into a focused loader owning those dependencies.
* Build indexes by bucket and identity once per snapshot. Remove repeated full-array filtering per bucket.
* Generate tooltip and accessibility metadata with each dataset row, not in React.
* Update call sites directly. Do not create re-export shims or forwarding methods.

## Edge cases

Preserve UTC boundaries, zero-filled buckets, numeric-zero unavailable rows, stable identities/colors, canonical conversation deduplication, exclusion reasons, partial-source warnings, load cancellation, and released-stat cache writes.

## Acceptance criteria

* `project_stats_service.ts` contains orchestration only and has one reason to change.
* Each extracted module owns one cohesive responsibility and is directly imported by consumers.
* Dataset aggregation avoids bucket-count × record-count scans.
* No behavior, CSV schema, persistence schema, or public service lifecycle changes.
* Existing focused tests, `npm run test:unit`, `npm run typecheck`, and `npm run lint` pass.

## See also

* `design/feature_descriptions/F_211_stats_view_improvements.md`
* `design/feature_descriptions/J_29_investigate_and_improve_stats_load_speed.md`
* `design/architecture/architectural_decisions.md`
