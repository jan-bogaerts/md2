---
author: 
id: B_295
internalId: c2391409-5ac7-4a3f-97fa-ac76e3739364
title: Error: Git command timed out: command="git" "statu
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 145227903
sentryOrganization: elastetic
after: 9ca3ca6c-6799-4e6e-b30b-95e48f9b027f
---

## Sentry issue

**Title:** Error: Git command timed out: command="git" "status" "--porcelain" cwd="C:\\Users\\janbo\\Documents\\dev\\md2" elapsedMs=63681 operation="desktop Git status"

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/145227903/)

**First seen:** 2026-09-13T15:58:09Z

**Last seen:** 2026-09-13T15:58:09Z

**Occurrences:** 1

**Release:** desktop@0.5.3

**Environment:** production

**Culprit:** GitProcess.handleTimeout(desktop.src.git:git_process)

**Event ID:** 8ae9d39d4b5946829c6eddc0a2f1d781

### Application stack frames

- `app:///desktop/src/git/git_process.js:93:23` — GitProcess.handleTimeout