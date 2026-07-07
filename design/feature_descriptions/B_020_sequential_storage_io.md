---
id: B-020
title: storage I/O is fully sequential (no batching or parallelism)
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
**Still open after the B-002/B-010 fixes (2026-07-06 audit).** All GitHub storage traffic in `app/src/services/github_storage_service.ts` is serial, one awaited request at a time:
- `readDirectory`/`readRootMarkdownFiles` fetch file contents one by one and recurse per directory;
- `listRepositoryFiles` → `readRepositoryFilePaths` does a full recursive contents-API walk (one request per directory) even though the trees API with `?recursive=1` — already used by `getRecursiveTreeEntries` for sha checks — returns the whole file list in one call;
- `loadActionFiles` fetches per entry; `commit()` creates blobs sequentially per file;
- `DataService.resolveAgentConversations` awaits each agent log sequentially.

New since the original report: `assertPathShasMatch` fetches the **full recursive tree on every batched commit** (each ~30 s auto-save flush), a heavy request per save on large repos.

Phased loading (B-010) keeps first paint fast, but the background phase and every commit are O(files) round-trips.

## Fix
- Parallelize independent reads with a bounded concurrency helper (e.g. 6–8 in flight) for directory file fetches, action files, blob creation and agent logs.
- Prefer cheaper API shapes: use the Git trees API (`?recursive=1`) for `listRepositoryFiles` and directory enumeration; raw blob download via the `download_url`/raw media type avoids the base64 JSON round-trip per file.
- Reduce the per-commit tree fetch: cache the last known tree entries per branch head and only refetch when the head sha changed, or limit verification to the committed paths via targeted contents requests.
- Local mode: may stay serial (fast disk) but can share the concurrency helper harmlessly.

## acceptance criteria
- Opening a GitHub project issues bounded-parallel content requests and uses a single tree listing instead of per-directory recursion.
- Wall-clock open time on a repo with ≥100 background files drops proportionally (manual verification; unit tests assert bounded concurrency).
- Error handling per file is preserved: one failed file does not abort the batch silently — it is reported and skipped or fails the load as today, per operation.

## see also
- `design\feature_descriptions\B_010_blocking_project_load.md`
- `design\feature_descriptions\B_002_github_push_semantics.md`
