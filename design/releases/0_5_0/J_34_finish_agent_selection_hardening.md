---
author:
id: J_34
internalId: d3078abd-23e1-4c90-8b8e-6ee6459b005f
title: finish agent selection hardening
status: ready
owner:
affects:
agents:
  - design/releases/V_0_5_0/card__d3078abd-23e1-4c90-8b8e-6ee6459b005f.json
policy:
after: 56bd50ce-b28c-4eb4-83cb-1951221f7864
---

F_216 introduced shared per-agent model and thinking-level memory, but several persistence, compatibility, and execution paths remain incomplete.

## Fixes

* Use migration-aware activity parsing at every activity-file boundary. Existing version-4 files must load and migrate for action history, conversations, card settings, release operations, GitHub storage, activity updates, and token usage. Do not require a prior write or repair pass.
* Keep non-card agent selections for the renderer session. Project, folder, regular-file, and merge-conflict popup close/reopen cycles must reuse a stable store keyed by action and context. Clear these stores when project identity changes.
* Keep shared permission mode in selection memory, but omit it from flat execution input for agents that do not support permission modes. Custom-agent popup runs must not fail because another agent's shared permission choice is present.
* Reject profile default thinking levels unsupported by that profile. Custom profiles without a thinking-level adapter may use only `none` unless explicit profile capability support is added.
* Normalize legacy agent profiles before strict validation wherever desktop config enters the renderer or host, including remote-desktop config. Profiles missing `defaultThinkingLevel` migrate to `none`.
* Keep unavailable remembered agents, models, and thinking levels visible in config, global controls, and action-popup submenus. Mark them unavailable and surface the existing validation error; never silently replace or hide them.
* Register `actionAgentSelectionDraftService` with the service injector, following singleton-service architecture.
* Remove duplicated hard-coded desktop selection fallback. Use one exported canonical default.

## Compatibility and failure behavior

* Version-4 activity migration preserves active agent, model, thinking level, permission mode, conversations, records, and origin.
* Migration participates in existing queued read-modify-write activity updates and must not introduce unqueued rewrites or lost concurrent changes.
* Stored invalid or unavailable remembered values remain unchanged until user edits them.
* Persistence and migration failures continue through `dialogService`; affected actions remain safely disabled when settings cannot be resolved.
* Conversation selection must not change selection scope or copy settings between actions or cards.

## Tests

Add regression coverage for:

* Real version-4 files loaded through every production consumer, not only direct migration helpers.
* Version-4 activity updated concurrently after migration.
* Non-card popup settings restored after close/reopen and cleared after project change.
* Custom-agent execution with retained shared permission mode.
* Rejection of unsupported custom-profile thinking defaults.
* Remote config containing legacy profiles without `defaultThinkingLevel`.
* Unavailable remembered values remaining visible with validation errors.

## Acceptance criteria

* All F_216 acceptance criteria pass through production entry points.
* Existing version-4 activity and legacy desktop config load without data loss.
* Built-in and custom agents receive only supported flat execution settings.
* Card memory persists per card/action; non-card memory persists for renderer session only.
* Shared selection code remains single source for transitions, defaults, validation, and projection.
* `npm run typecheck`, `npm run lint`, affected tests, app full tests, and desktop full tests pass.

## See also

* `design/feature_descriptions/F_216_improve_agent_selection.md`
* `design/architecture/architectural_decisions.md`
