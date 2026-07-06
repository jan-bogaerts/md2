---
id: B-020
title: storage I/O is fully sequential (no batching or parallelism)
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
All GitHub storage traffic is serial, one awaited request at a time: `readDirectory` recurses and fetches file contents one by one, `loadActionFiles` fetches per entry, `commit()` PUTs per file, and `DataService.resolveAgentConversations` awaits each log sequentially. Project open time grows linearly with file count; a modest repo with history takes many seconds.

## Fix
- Parallelize independent reads with a bounded concurrency helper (e.g. 6–8 in flight) for directory file fetches, action files and agent logs.
- Prefer cheaper API shapes: the Git trees API (`?recursive=1`) yields the full file list in one call; raw blob download via the `download_url`/raw media type avoids the base64 JSON round-trip per file.
- Commit batching is covered by B-002 (single tree/commit per request).
- Local mode: `readMarkdownFiles` may stay serial (fast disk) but can share the concurrency helper harmlessly.
- Combine with B-010's phased loading so the parallel background phase never blocks first paint.

## acceptance criteria
- Opening a GitHub project issues bounded-parallel content requests and uses a single tree listing instead of per-directory recursion.
- Wall-clock open time on a repo with ≥100 background files drops proportionally (manual verification; unit tests assert bounded concurrency).
- Error handling per file is preserved: one failed file does not abort the batch silently — it is reported and skipped or fails the load as today, per operation.

## see also
- `design\feature_descriptions\B_010_blocking_project_load.md`
- `design\feature_descriptions\B_002_github_push_semantics.md`
