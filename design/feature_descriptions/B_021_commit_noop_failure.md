---
id: B-021
title: local git commit fails when nothing changed
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`commit()` in `desktop/local_git_service.js` always runs `git commit -m …` after writing/adding the files. If the written content is identical to what is already committed (e.g. an auto-save of unchanged text, a policy toggled back within the batch window), `git commit` exits non-zero ("nothing to commit") and the error propagates through the commit batcher as a failure.

## Fix
- Before committing, check for staged changes (`git diff --cached --quiet` exit code, or `git status --porcelain` on the touched paths) and return successfully when there is nothing to commit.
- Same guard in `saveProjectConfig` and `createProject` commit paths.
- Optionally have `DataService.saveFile` skip scheduling when the new content equals the in-memory file, cutting the noise at the source.

## acceptance criteria
- Saving unchanged content produces no error and no empty commit.
- Real changes still commit exactly as before.
- Tests cover the no-op save path and a mixed batch (one changed + one unchanged file).

## see also
- `design\feature_descriptions\F_002_data_management.md`
