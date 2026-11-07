---
author: 
id: B_308
internalId: ba0c496e-89f0-4041-953e-958d2f53c23f
title: Error: Linked worktree has uncommitted changes: C:
status: ready
owner: 
affects:
agents:
  - design/activity/card__ba0c496e-89f0-4041-953e-958d2f53c23f.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 144956120
sentryOrganization: elastetic
changedFiles:
  - app/src/components/worktree_selector.test.tsx
  - app/src/components/worktree_selector.tsx
  - app/src/data/bridge_error_rehydration.node.test.ts
  - desktop/src/git/worktree_resolution.test.mjs
  - desktop/src/git/worktree_service.js
  - shared/worktree_errors.d.mts
  - shared/worktree_errors.mjs
---
## Current state

Assigning a linked worktree to a card calls `WorktreeService.setCardWorktree`, which asks the desktop host to prepare the selected checkout. The desktop service revalidates the checkout and intentionally rejects the operation when it contains uncommitted changes. The checkout and its changes remain untouched.

`WorktreeSelector` catches the rejection and calls `dialogService.error`. That method reports every error to Sentry before showing it to the user. The expected dirty-worktree guard is therefore recorded as an application failure.

## Implementation details

Add a shared error code for the expected dirty linked-worktree condition. Set this code on the error thrown by the desktop worktree cleanliness guard. The existing bridge error envelope already preserves string error codes, so the renderer can identify the condition without matching its message.

In the worktree assignment UI, show this coded error with `dialogService.displayError`, retaining the current user-visible message without sending telemetry. Continue using `dialogService.error` for all other preparation failures.

The cleanliness guard is also used by pull, rebase, integration, conflict recovery, synchronization, and parking operations. Adding the code must preserve their current rejection behavior; this change only alters telemetry handling for the card-assignment path covered by this issue.

Add focused tests that verify the desktop rejection carries the error code, the bridge preserves it, the assignment UI displays the message without reporting telemetry, and an unexpected preparation error is still reported.

## Acceptance criteria

- Assigning a dirty linked worktree to a card is rejected before any branch switch or file change.
- The user sees that the linked worktree has uncommitted changes.
- The expected dirty-worktree rejection is not sent to Sentry from the card-assignment flow.
- Dirty-worktree checks for other worktree operations retain their existing behavior.
- Unexpected worktree preparation failures remain visible to the user and are sent to Sentry.

## Sentry issue

**Title:** Error: Linked worktree has uncommitted changes: C:\Users\janbo\Documents\dev\md2_workers\dev2

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/144956120/)

**First seen:** 2026-09-25T15:36:13Z

**Last seen:** 2026-09-25T15:36:13Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** wm(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-0itPY5Od.js)

**Event ID:** a7947d64478a41309c2fd53f6fd5fb8d

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-0itPY5Od.js:2334:29687` — async le
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-0itPY5Od.js:2334:28968` — async se
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-0itPY5Od.js:139:35668` — async EventTarget.setCardWorktree
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-0itPY5Od.js:283:24628` — async xve.prepareWorktree
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-0itPY5Od.js:120:28764` — Tre
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-0itPY5Od.js:120:28633` — Tm
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-0itPY5Od.js:120:28485` — wm

Don't think we should send this to sentry
