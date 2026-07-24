---
id: B-010
title: project load is one blocking pass (phased loading not implemented)
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 6f6c9ec3-74aa-44c7-a93e-e5b785c66d37
---

## Problem
F-002/F-006 require phased loading: "Root markdown headers populate active cards **before** background subfolder header loading begins" and "Root files are usable before subfolder files finish loading". Actually `loadProject` reads the whole working folder recursively in one pass, and `DataService.createSnapshot` then serially `await`s **every** agent log before publishing the first snapshot. In GitHub mode this is one REST request per file, sequential — a project with history archives blocks the UI for the entire load.

## Fix
- Split loading in `DataService.openProject`: load and publish the root working-folder files first (snapshot with `activeCards`, empty/partial `backgroundCards`), then load subfolders in the background and dispatch an updated snapshot when done.
- Storage support: add a shallow/root-only load (GitHub: one directory listing + root files; local: non-recursive read) alongside the recursive one, or a callback/async-iterator that streams batches.
- Resolve agent conversations lazily or in parallel (`Promise.all` with a small concurrency cap), and never block the first snapshot on them — attach conversations when loaded and dispatch `changed`.
- Keep search working: it naturally sees background cards once they arrive.

## acceptance criteria
- Opening a project shows active cards before any subfolder/history file has been fetched.
- Background cards and agent conversations appear later without replacing open tabs or user state (F-006 criterion).
- GitHub project open no longer performs serial per-file agent-log awaits before first paint.
- Tests cover two-phase snapshot dispatch and late conversation attachment.

## see also
- `design\feature_descriptions\F_002_data_management.md`
- `design\feature_descriptions\F_006_text_view.md`
- `design\feature_descriptions\B_020_sequential_storage_io.md`
