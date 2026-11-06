---
author: 
id: B_331
internalId: cf2c723d-9757-4eca-b718-2f5508f1b4ee
title: Error: Cannot save a card without an internal ID: 
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__cf2c723d-9757-4eca-b718-2f5508f1b4ee.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 158900983
sentryOrganization: elastetic
after: ac32ed09-2e05-4ae3-9a90-8a03bba61616
branch: b_331_error_cannot_save_a_card_without_an_internal_id
worktree: 2
---
## Sentry issue

**Title:** Error: Cannot save a card without an internal ID: design/more details.md

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/158900983/)

**First seen:** 2026-11-05T16:18:13Z

**Last seen:** 2026-11-05T16:20:14Z

**Occurrences:** 15

**Release:** Not provided

**Environment:** production

**Culprit:** Ise.saveCardChange(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js)

**Event ID:** b02c1271dc4f408cb98312a11696fb2e

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:25:6718` — HTMLDivElement.r
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:11:28333` — yf
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:11:28511` — xf
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:127805` — Yu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:15085` — Qt
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:131579` — unknown function
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:126576` — Uu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:559:27911` — o
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:2633:19032` — unknown function
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:519:41435` — EventTarget.commit
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:519:43753` — EventTarget.withLoading
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:519:41470` — unknown function
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:151:9900` — e.flushPendingChanges
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:151:4148` — rce.updateCardBody
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:150:27178` — Ise.saveCardChange



# More details

This bug occurred while I was editing a generic markdown file in `list view`. So the markdown file did not (and should not) have a header section with an `internal id`.&#x20;

possible solutions here: we could generate a temporary id, that is only valid while 'in memory? we just need to make certain that we don't save a header in these generic markdown files.

or we could use the path. only problem here, what if the filename changes.

## Current state

All project Markdown files are parsed into card-shaped records for the list view. Real cards use `Card.header.internalId` as identity. Regular Markdown files intentionally have no `internalId` and use their path as persistence identity.

Both list-editor commits and `ProjectPersistenceService.flushPendingChanges()` save dirty card documents through `CardOperations.updateCardBody()`. That method always calls `CardOperationContext.saveCardChange()`, which requires an `internalId`. Saving a regular Markdown file therefore throws before a commit is queued or the open-document save is acknowledged, so the document remains dirty and later flushes repeat the failure.

`saveCardChange()` currently mutates the in-memory card before checking its `internalId`. The failed save can therefore change in-memory content even though it schedules no persistence.

The existing file commit path already persists content by path and supports open-document save acknowledgement. Existing tests cover loading and opening regular Markdown, but do not cover editing and saving it.

## Implementation details

* Keep `CardOperations.updateCardBody()` as the single body-save entry point used by the editor and project persistence.
* Resolve the loaded record before selecting the persistence path. If it has an `internalId`, keep the existing card change flow unchanged.
* If it has no `internalId`, treat it as regular Markdown. Replace only the body in the loaded source file, preserving existing frontmatter and line endings, then queue it through the existing file commit flow with the supplied save reference.
* Use the regular Markdown file's current path as its persistence identity. Do not generate a temporary or persisted `internalId` and do not add card frontmatter.
* Move the `internalId` validation in `saveCardChange()` before mutation so rejected card-only operations cannot modify in-memory state.
* Add focused service tests for direct editor commit and `flushPendingChanges()`. Keep existing card save behavior and tests unchanged.

## Acceptance criteria

* Editing a regular Markdown file in list view queues and persists the changed body without an error.
* Manual commit, automatic commit, and project pending-change flush all use the same file commit path for regular Markdown.
* A successful save acknowledges the open-document save reference and clears its dirty state.
* A failed save remains pending and uses the existing persistence error reporting.
* Saving a headerless regular Markdown file does not add frontmatter or an `internalId`.
* Saving regular Markdown that already has frontmatter preserves that frontmatter and its line endings while changing only the body.
* Cards with an `internalId` continue to use card serialization and stable card identity.
* Calling a card-only save operation for a record without an `internalId` fails before mutating in-memory state.
