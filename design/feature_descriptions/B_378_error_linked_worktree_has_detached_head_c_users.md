---
author: 
id: B_378
internalId: 08b55903-731a-4a0d-be87-6818029c82b2
title: Error: Linked worktree has detached HEAD: C:\Users
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__08b55903-731a-4a0d-be87-6818029c82b2.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 161607340
sentryOrganization: elastetic
---

## Current state

Assigning a linked worktree to a card prepares the checkout through the desktop `WorktreeService`. Preparation revalidates the selected checkout and rejects it when `git branch --show-current` returns no branch. `WorktreeSelector` then passes the rejection to `dialogService.error`, which shows the error and reports it to Sentry.

The `dev1` reflog shows a rebase starting and finishing at 2026-11-16 17:10:45 local time. Sentry recorded this event one second later. Git temporarily detaches HEAD during a rebase, so worktree preparation observed an expected transient state. The detached-HEAD check runs before the dirty-status check; uncommitted files did not cause this error. Dirty linked-worktree assignment errors are already displayed without Sentry reporting.

## Implementation details

- Add a shared error code and predicate for a linked worktree that is temporarily detached by an active rebase.
- When `WorktreeService.revalidateRecord` finds no current branch, check the checkout's `rebase-merge` and `rebase-apply` Git state paths. Throw the coded expected error when either rebase state is active.
- Preserve the existing uncoded detached-HEAD error when no rebase is active. That condition remains an invalid checkout and must still be reported.
- In `WorktreeSelector`, show the coded active-rebase error with `dialogService.displayError`. Keep using `dialogService.error` for a detached checkout without an active rebase and for other unexpected preparation failures.
- Add focused tests for active-rebase detection, bridge error-code preservation, suppression of telemetry for the expected condition, and continued reporting of a genuinely detached checkout.

## Acceptance criteria

- Preparing a worktree that is temporarily detached by an active rebase is rejected without changing its branch, files, or rebase state.
- The user sees that the worktree is currently being rebased and can retry after the rebase finishes.
- The active-rebase rejection is not sent to Sentry from the worktree-assignment flow.
- A detached HEAD without active `rebase-merge` or `rebase-apply` state remains an error and is sent to Sentry.
- Dirty linked-worktree assignment errors retain their existing behavior and are not sent to Sentry.
- Unexpected worktree preparation failures remain visible to the user and are sent to Sentry.

## Sentry issue

**Title:** Error: Linked worktree has detached HEAD: C:\Users\janbo\Documents\dev\vidsy_workers\dev1

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/161607340/)

**First seen:** 2026-11-16T16:10:46Z

**Last seen:** 2026-11-16T16:10:46Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Dre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js)

**Event ID:** f978eeb55ecd4b4ebc609515418fd6a9

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js:146:67436` — async pie.prepare
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js:731:44939` — async SVe
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js:146:2554` — kre
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js:146:2422` — nh
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js:146:2274` — Dre
