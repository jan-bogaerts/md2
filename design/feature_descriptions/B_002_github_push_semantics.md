---
id: B-002
title: github push semantics wrong (manual push meaningless, N commits per batch)
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
The GitHub backend uses the contents API, which commits **directly to the remote branch**. `GithubStorageService.push()` is a no-op token check, so "manual push" mode does not hold anything back — contradicting F-002 ("manual-push mode leaves commits unpushed until the user runs the push command"). Additionally, `commit()` loops PUTs per file, so one logical commit request becomes N separate remote commits, and a mid-loop failure leaves a partial batch with no rollback.

## Fix
Use the Git data API for commits instead of the contents API: create blobs → tree → commit → update ref. This gives:
- one real commit per `CommitRequest` (correct message, all files atomic);
- true manual-push support: in manual mode, keep created commits on a local ref/pending chain and only move the branch ref on `push()`; in auto mode update the ref immediately. (If deferred-ref bookkeeping is too heavy for a first pass, minimum viable fix: keep contents-API behavior but make the UI honest — hide the push button/mode for GitHub projects and document that GitHub commits are immediate.)
- no partial batches: the ref only moves when the whole tree/commit is built.

## acceptance criteria
- A multi-file `CommitRequest` produces exactly one commit on the branch with the request's message.
- In manual mode, committed changes are not visible on the remote branch until `push()`; in auto mode they are.
- A failure while building a commit leaves the branch untouched.
- If the fallback UI-honesty option is chosen instead: GitHub mode shows no manual-push option and the docs/config reflect that.
- Tests cover single-commit batching and manual/auto ref behavior with a mocked API.

## see also
- `design\feature_descriptions\F_002_data_management.md`
- `design\architecture\initial description\data management.md`
