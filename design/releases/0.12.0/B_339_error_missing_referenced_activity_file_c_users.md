---
author: 
id: B_339
internalId: 885c223a-31ec-48c3-8390-f85015ab9c23
title: Error: Missing referenced activity file: C:\Users\
status: ready
owner: 
affects:
agents:
  - design/releases/0.12.0/card__885c223a-31ec-48c3-8390-f85015ab9c23.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 155181382
sentryOrganization: elastetic
changedFiles:
  - app/src/services/agents/agent_integration.test.ts
  - app/src/services/agents/agent_integration.ts
  - app/src/services/data/data_service.ts
  - app/src/services/data/external_card_import_service.node.test.ts
  - app/src/services/data/external_card_import_service.ts
  - app/src/services/project/project_loading.test.ts
  - app/src/services/project/project_loading.ts
  - desktop/src/actions/activity/activity_files.js
  - desktop/src/actions/activity/activity_files.test.mjs
  - shared/card_activity.d.mts
  - shared/card_activity.mjs
after: 22edc81f-6888-44c5-8d8b-48207057c653
---

## Sentry issue

**Title:** Error: Missing referenced activity file: C:\Users\janbo\Documents\dev\md2\design\activity\card__7ce53acc-5a73-4566-931c-96751c9dac9b.json

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/155181382/)

**First seen:** 2026-10-21T12:42:34Z

**Last seen:** 2026-10-22T14:23:48Z

**Occurrences:** 32

**Release:** Not provided

**Environment:** production

**Culprit:** mre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js)

**Event ID:** efbc4786c0f4461f9f732521ee9c49e4

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:503:207734` — async A_e.hydrateActiveCardConversations
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:19162` — async Yse.hydrateActiveCardConversations
- `index 61` — async Promise.all
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:18916` — async Yse.ensureAgentConversationsForCard
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:23283` — async Yse.resolveAndAttachAgentConversations
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:13671` — async Jse
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:13301` — async Wg
- `index 0` — async Promise.all
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:13097` — async Use
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:13760` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2554` — gre
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2422` — Bm
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2274` — mre

## Current state

* On 2026-10-20, commit `13c9d12cd` ("Import 1 external file") imported cards F_436 to F_443, which were written outside the app. Each card already had an `agents:` entry pointing to its own activity file, for example `design/activity/card__7ce53acc-….json` for F_438. None of these files existed. F_438's activity file was only created on 2026-11-02.
* `planExternalCardImports` in `app/src/services/data/external_card_import_service.ts` only rewrites `id`, `internalId`, `status` and `title`. It keeps the `agents:` list unchanged, so the broken references were committed.
* On every project open, reload and file-watch import, `AgentIntegration.hydrateActiveCardConversations` loads conversations for each active card. `resolveCardConversations` in `app/src/services/agents/agent_integration.ts` calls `loadActivityConversations` for each referenced path.
* The desktop function `readActivityFile` in `desktop/src/actions/activity/activity_files.js` is called without an origin, so a missing file throws a plain `Error("Missing referenced activity file: …")` with no error code.
* `resolveCardConversations` catches the error, records it as a card load error, and shows a warning dialog through `reportNewLoadErrors`. That handling is correct. It also calls `telemetryService.captureError` on every load, which sent 32 events to Sentry for a user-data problem.
* The error stopped when commit `756e4817e` removed the `agents:` entry from F_438 on 2026-10-22. The underlying cause is still present.
* Error codes already cross the Electron and remote-control bridges: `serializeBridgeError` in `shared/bridge_errors.mjs` keeps `code`, and `rehydrateBridgeError` in `app/src/data/bridge_error_rehydration.ts` restores it.

## Implementation details

### 1. Drop references to missing activity files on import

* Change `planExternalCardImports` in `external_card_import_service.ts` to take a new parameter, `repositoryFiles: ReadonlySet<string> | null`, which holds normalized repository paths.
* When `repositoryFiles` is not `null`, filter the parsed `agents` list. Keep only references whose activity path, resolved with `activityPathForCardReference` and normalized, is in `repositoryFiles`. If the list changes, rewrite the imported content with `markdownParsingService.setAgentLogReferences`.
* When `repositoryFiles` is `null`, keep the references unchanged, because the repository index is unknown.
* `ProjectLoading.planDetectedCardImports` in `app/src/services/project/project_loading.ts` gets the same parameter and passes it on. It has two callers:
  * `loadFullProjectInBackground` passes the freshly listed `repositoryFiles` when `listRepositoryFiles` succeeded, and `null` when it failed.
  * The file-watch handler passes the snapshot's `repositoryFiles` merged with the paths of the current watch batch when the full project load has completed, and `null` before that, while the snapshot index is still empty. To check this, add `isFullProjectLoaded(): boolean` to `ProjectLoadingDeps` and wire it to `dataService.isFullProjectLoaded()`.
* Existing cards keep their references. Only cards imported from outside the app are cleaned up.

### 2. Stop sending missing activity files to Sentry

* Add `MISSING_ACTIVITY_FILE_ERROR = 'missing-activity-file'` to `shared/card_activity.mjs` and its declaration file `shared/card_activity.d.mts`.
* In `readActivityFile` in `activity_files.js`, set `error.code = MISSING_ACTIVITY_FILE_ERROR` on the "Missing referenced activity file" error. The message stays the same.
* In `resolveCardConversations` in `agent_integration.ts`, skip `telemetryService.captureError` when the error's `code` is `MISSING_ACTIVITY_FILE_ERROR`. The card load error and the warning dialog stay unchanged. Other errors are still captured.

### Out of scope

* The GitHub storage loader (`github_storage_loader.ts`) has its own missing-file error and is not changed.
* Cards that an agent writes directly with a valid card file name are not imports, so step 1 does not clean them. Step 2 still keeps those cases out of Sentry.

### Tests

* `external_card_import_service.node.test.ts`:
  * an import drops `agents` references that are not in `repositoryFiles` and keeps the ones that are;
  * with `repositoryFiles` set to `null`, the references are kept.
* `desktop/src/actions/activity/activity_files.test.mjs`: the missing-file error carries `MISSING_ACTIVITY_FILE_ERROR`.
* `agent_integration.test.ts`: a missing-file error is recorded as a card load error and shown as a warning but is not passed to `captureError`, while another load error is still captured.
* `project_loading` tests: the background load passes the repository index to the import plan, and passes `null` when listing repository files fails.

## Acceptance criteria

* Importing an external card whose `agents:` list points to a missing activity file commits the card without that reference. References to existing activity files are kept.
* If the repository file index is unavailable, the import keeps the card's `agents:` references unchanged.
* Opening a project with a card that references a missing activity file still shows the "Some agent conversations were not loaded" warning, and the card's other conversations still load.
* A missing activity file no longer sends an error to Sentry. Other conversation load errors still do.
* Existing tests and the new tests pass, and `npm run lint` passes in `app` and `desktop`.