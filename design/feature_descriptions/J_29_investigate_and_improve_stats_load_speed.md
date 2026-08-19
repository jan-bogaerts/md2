---
author: 
id: J_29
internalId: 3ebc6426-47fe-41b8-bb66-da98818be9d9
title: investigate and improve stats load speed
status: ready
owner: 
affects:
agents:
  - design/activity/card__3ebc6426-47fe-41b8-bb66-da98818be9d9.json
policy:
after: b0e7104c-8f81-425e-8473-66b569a63d81
---

This file: [Trace-20260818T181428.json](file:///C:/Users/janbo/Documents/dev/Trace-20260818T181428.json) is a trace taken when loading the stats data for the stats view.

analyze and see what can be improved. why is it taking so long?

## Current process

1. Opening Stats calls `ProjectStatsService.open()`.
2. The service lists all repository files and finds current and released activity files.
3. Every matching activity file is loaded separately through `StorageService` and Electron IPC for a local project.
4. Every complete activity file, including conversation transcripts, is parsed and validated in the renderer.
5. Usage metrics are loaded, chart rows are calculated, and the chart is rendered.

The trace shows a load of about 4.6 seconds. About 4.2 seconds are spent loading, transferring, and parsing activity. Stats aggregation takes about 9 ms and is not the bottleneck. The current repository has 134 matching activity files containing about 570 MB of JSON.

## Problems

### Conversations are serialized and parsed twice

`parseActivityFileForMigration()` first parses the complete activity JSON. `parseConversation()` then calls:

```javascript
parseAgentConversation(JSON.stringify(value), '')
```

Each already-parsed conversation is converted back to JSON and parsed again. The repair path repeats the same pattern for individual entries. This duplicate serialization and parsing operates on the largest part of the activity data and accounts for a substantial part of the load time.

Add a value-based conversation parser. Keep the existing string-based `parseAgentConversation(content, referencePath)` API for its current callers, but have it parse the string once and delegate to the value-based parser. Activity parsing and repair must pass values directly without `JSON.stringify()`.

### Stats reload unnecessarily

The stats service currently continues behaving as active after Stats is hidden:

- `isOpen` remains true until the project is cleared.
- Every relevant repository watcher event starts a complete reload.
- A superseded load is only ignored after its reads and parsing finish; it is not cancelled.
- Card snapshot changes while Stats is visible can call `open()` again.
- Reopening Stats reloads without first having released the previous loaded source.

Stats do not need live monitoring. Treat each visit to Stats as one fixed viewing session:

- Load stats once when the view opens.
- Do not subscribe or react to activity, usage-metrics, repository, or card changes while the view is open.
- Re-renders and card snapshot changes must not start another load.
- When the user leaves Stats, close the stats session and unload all loaded activity, calculated rows, warnings, and errors.
- Opening Stats again starts one new load from current repository data.
- Remove stats handling from the repository-change dispatch path.

### Released activity is static but repeatedly recalculated

Released activity does not change during normal operation, but every Stats load reads and recalculates it. Calculate released-card stats when a release is created and store the calculated release data in a project stats file. The stored data must contain the compact facts required by all supported groupings, metrics, date filters, and granularities; it must not contain conversation transcript entries.

Stats loading then combines:

- calculated data from the stats file for releases; and
- freshly calculated data from current, non-released activity files.

Existing releases need a one-time calculation to populate the stats file. Run this heavy migration outside both the renderer and Electron main thread. Local projects can use a worker or utility process; browser-hosted storage must use an equivalent worker path. Once calculated, later Stats loads must not read the released activity files again.

When a release is created, write its calculated stats in the same release operation so the activity move and calculated data cannot diverge. Release names and stable card, action, conversation, and run identities must remain available for grouping and deduplication.

## Partial data and failures

Stats should load whatever valid data is available:

- A malformed or unreadable current activity file is skipped and reported as a warning identifying the path.
- One bad source must not make the complete stats view unavailable.
- A missing or malformed calculated release entry is skipped and reported as a warning.
- A missing stats file triggers the one-time release calculation when releases exist.
- Missing `usage_metrics.csv` continues to make token-over-time data unavailable without preventing other stats.
- If no valid source remains, show the normal empty state with the collected warnings.

The stats file itself must be strictly parsed so corrupt entries are not silently interpreted as valid data. Strictly validating every original activity source on every Stats load is not required.

## Affected components

- `shared/agent_conversations.mjs`: add value-based parsing and keep the string API as a wrapper.
- `shared/card_activity.mjs`: remove nested serialization/parsing in normal and repair paths.
- `app/src/components/stats_view/stats_view.tsx`: open once on entering Stats and close on leaving it.
- `app/src/services/stats/project_stats_service.ts`: implement session lifecycle, partial source loading, current-activity calculation, and calculated release-data loading. Remove repository monitoring.
- `app/src/services/data/data_service.ts`: stop forwarding repository changes to the stats service.
- Release creation and archiving: calculate and persist released stats with the release.
- Storage and worker boundary: perform the one-time calculation without blocking the renderer or Electron main thread.

## Compatibility and edge cases

- Existing callers of `parseAgentConversation(string, referencePath)` keep their current behavior.
- Current activity remains dynamic and is recalculated on each new Stats visit.
- Released data is calculated once and reused.
- Leaving Stats during a load must prevent late results from repopulating unloaded state. In-flight worker or storage work should be cancelled where supported; otherwise its result must be discarded.
- Reopening Stats after closing it must not reuse a partially completed previous load.
- Project or branch changes close and unload the active stats session.
- Release creation, deletion, rename, and replacement must update the calculated release data consistently.
- Duplicate conversations and action runs retain the existing canonical identity and deduplication behavior.

## Testing implications

- Regression test that activity parsing no longer stringifies and reparses conversations or repair entries.
- Existing string-based conversation parser tests continue to pass; add equivalent value-parser tests.
- Opening Stats performs exactly one load despite card snapshots, repository events, or component re-renders.
- Leaving Stats unloads data and prevents a late load result from publishing.
- Reopening Stats performs one fresh load.
- Released stats are written during release creation and loaded without reading released activity files.
- Existing releases are calculated once, stored, and reused.
- Malformed sources are skipped independently and produce path-specific warnings.
- Current and calculated release data produce the same rows as the existing implementation for valid input.
- Add a representative large-data performance test at the worker/calculation boundary without committing large fixture archives.
