---
id: B-022
title: commit batcher keeps only the last message for a batch
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`CommitBatcher.schedule` (`app/src/data/commit_batcher.ts`) overwrites `pendingMessage` on every call, so a 30-second batch touching several files (card move updates two/three files; edits across cards) is committed as "Update {lastFile}" — a misleading history for the repo the app is supposed to manage cleanly.

## Fix
- Collect messages per scheduled path; on flush build a combined message: single distinct message → use it; multiple → summary line like `Update 3 files` plus a body listing the individual messages (git supports multi-line messages through both backends).
- Deduplicate repeated messages for the same path (repeated auto-saves of one file keep one line).

## acceptance criteria
- A batch with one logical change keeps its exact message.
- A batch with multiple files produces a summary + per-file lines, in both local Git and GitHub modes.
- Tests cover message accumulation, dedupe and flush output.

## see also
- `design\feature_descriptions\F_002_data_management.md`
