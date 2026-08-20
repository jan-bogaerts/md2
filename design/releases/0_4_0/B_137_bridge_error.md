---
author: 
id: B_137
internalId: 7fb7af14-458a-478c-9b9b-a0b3985214b2
title: bridge error
status: ready
owner: 
affects:
agents:
  - design/releases/0_4_0/card__7fb7af14-458a-478c-9b9b-a0b3985214b2.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 141200034
sentryOrganization: elastetic
branch: b_137_bridge_error
after: 6d6bf2a1-f9ac-430c-ad48-255ae837c9a0
---
## Sentry issue

**Title:** Error: Error invoking remote method 'md2-local-bridge:invoke': Error: ENOENT: no such file or directory, open 'C:\Users\janbo\Documents\dev\md2\design\agent\_token\_usage.json'

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/141200034/)

**First seen:** 2026-08-17T17:17:16Z

**Last seen:** 2026-08-17T17:55:47Z

**Occurrences:** 5

**Release:** Not provided

**Environment:** production

**Culprit:** file:///C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/index.html

**Event ID:** a9212ad3e27d4667a0ad8589e866f8b1

### Application stack frames

* No application stack frames provided.

This is new. we tried to improve counting token usage cause it was going wrong. we introduced a new file that saves counted values of previous releases and such cause those counts don't change anyway. something went wrong, perhaps the algorithm always presumes that the file already exists and never creates it?

## Current state

`F_173` added `<projectFolder>/agent_token_usage.json`. New projects create this file with the project template. Existing projects create it lazily: `ProjectAgentTokenUsageService.load` first calls `loadTextFile`, treats a failed read as possible absence, lists repository files, migrates totals from card activity, then commits the summary.

Using a failed bridge read as the existence check produces an `ENOENT` rejection before expected migration can run. Initial load catches that rejection, but a file created between the failed read and repository listing makes it rethrow the stale error. Repository-change refresh reads the summary directly and starts that promise without handling rejection. A missing file during deletion or branch transition can therefore reach Sentry as an `md2-local-bridge:invoke` error.

Desktop terminal-conversation persistence has a separate missing-file path: `loadOrMigrateSummary` checks existence before reading and migrates when absent. Token normalization, release totals, and summary schema are not implicated by this issue.

## implementation details

- In `ProjectAgentTokenUsageService`, list repository files before reading the summary. If `agent_token_usage.json` is listed, load and parse it. If absent, migrate all card activity once and commit the generated summary. Do not use an expected `ENOENT` rejection as control flow.
- Apply the same load-or-migrate path when a repository event reports that the summary was removed. Added or changed events reload and parse the stored file.
- Serialize initial migration and repository-event refresh for one loaded project. Before applying or committing a result, verify that project and branch are still current. This prevents an earlier branch load from replacing the active summary.
- Handle every background refresh rejection. Keep last valid summary, report unexpected read, parse, migration, or commit failures through existing project-load warning and telemetry flow, and preserve malformed files without overwriting them.
- Keep current summary schema, legacy migration calculation, terminal-conversation persistence, release behavior, and new-project template creation unchanged.
- Extend `project_agent_token_usage_service.node.test.ts` and project-loading tests for missing, valid, malformed, removed, concurrent, and superseded-project cases. Add local bridge coverage proving first open of an existing project creates summary without a failed `loadTextFile` call.

## acceptance criteria

- Opening an existing project without `agent_token_usage.json` builds and commits one migrated summary, displays its totals, and produces no `ENOENT` dialog, unhandled rejection, or Sentry event.
- Opening a project with a valid summary reads it without migration or replacement.
- Missing-summary detection never calls `loadTextFile` for the absent path.
- Removing summary while project is open rebuilds it once. Concurrent file events do not start duplicate migrations or commits.
- Malformed or unreadable existing summary remains unchanged; user receives one warning and telemetry receives handled failure.
- A migration or refresh completed after project or branch changes cannot update current snapshot or commit to newly active project.
- Token bucket calculation, project and release totals, terminal-conversation persistence, and new-project summary creation retain existing behavior.
- Focused app and desktop tests pass.
