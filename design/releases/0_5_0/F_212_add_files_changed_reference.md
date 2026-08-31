---
author: 
id: F_212
internalId: e9e0858d-a215-42bb-873e-01848ea6a803
title: Add files changed reference
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__e9e0858d-a215-42bb-873e-01848ea6a803.json
policy:
after: de77178e-987f-437c-9af3-81b704eca3d4
---
We already keep track of file changes done by the agent. We should also keep track of the file paths that were changed, added, deleted and add this list to the header section of the card. Note no need for self reference of card (ex: when agent modifies card)

for the card popup, we already have a 'properties' button that shows a popup. This needs an extra field for the new 'changed files' item.

## Current state

Codex and Claude provider adapters already recognize file changes, extract their paths, normalize them to repository-relative paths, and accumulate them in agent run `changedPaths`. Completed `fileChange` conversation events also carry line insertions and deletions used by action popup. Card frontmatter and `CardHeader` do not retain an accumulated file list.

Card frontmatter parsing and serialization live in `markdown_parsing_service.ts`. Card changes flow through focused `CardOperations` mutations and batched persistence. `CardPropertiesPanel` shows card metadata, including read-only `Affects`, but has no changed-files row.

## implementation details

* Add `changedFiles: string[]` to `CardHeader` and persist it as `changedFiles:` frontmatter list. Missing field parses as empty list; empty list remains omitted until paths exist. Clone, comparison, serialization, project-state, and event snapshots must preserve stable array ownership.
* Keep paths as structured data on normalized `fileChange` events instead of parsing display `content`. Codex changes provide each change `path`; Claude file tools provide `file_path` or `notebook_path`. Reuse existing root confinement, `/` normalization, and deduplication from `normalizeChangedPaths`.
* Accumulate paths only from completed, successful `fileChange` events and publish them with terminal card-scoped run data. This uses same applied provider events as line-change totals and does not wait for, inspect, or require a Git commit. Failed, denied, cancelled, incomplete, malformed, and unsupported file operations add no paths.
* Add focused card operation that merges captured paths into existing `changedFiles`. Normalize separators to `/`, remove duplicates, sort paths, and exclude action context card path. Accumulate across runs; never replace earlier paths. No paths means no card write.
* Apply update through card-owning data service after action activity persists. Add granular `changedFiles` card event so only consumers of this field update. Preserve unrelated header fields, open editor drafts, and card body.
* Add read-only `Changed files` row to `CardPropertiesPanel`. Show comma-separated paths, `None` when empty, and full value through existing overflow-title pattern used by `Affects`.
* Test Codex and Claude event-path extraction, accumulation across runs, duplicate removal, sorting, separator normalization, added/updated/deleted paths, failed operations, card self-exclusion, and no-op runs. Extend parser, card operation, event, action-run, and Properties panel tests. Existing cards without field must still parse and save without data loss.

## acceptance criteria

* Each completed, successful provider `fileChange` event for card adds its repository-relative paths to card `changedFiles:` frontmatter without waiting for a Git commit.
* Added, modified, and deleted paths are retained. Paths use `/`, appear once, and stay sorted.
* Later runs accumulate paths with existing list. They do not remove earlier entries or create duplicates.
* Card's own Markdown path never appears in its `changedFiles` list, including when agent edits that card.
* Failed, denied, cancelled, incomplete, malformed, and unsupported operations add no paths. File edits reported only through shell-command output are not inferred from Git or filesystem state.
* Runs without successful provider-reported paths do not rewrite card. Existing cards without `changedFiles` load with empty list and need no migration.
* Updating changed files preserves all unrelated frontmatter, card body, and unsaved editor state.
* Board and list card Properties popups show read-only `Changed files`; empty list shows `None`, and long lists remain available in full through title tooltip.
* Focused tests pass independently; app unit suite and lint pass.
