---
author: 
id: B_137
internalId: 7fb7af14-458a-478c-9b9b-a0b3985214b2
title: Error: Error invoking remote method 'md2-local-bridge:invoke': Error: ENOENT: no such file or directory, open 'C:\Users\janbo\Documents\dev\md2\design\agent_token_usage.json'
status: design
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 141200034
sentryOrganization: elastetic
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



This is new. we tried to fix the following: when a card was assigned to a worktree, the app would write to agent\_token\_usage.json in the worktree, not the project folder. when trying to fix this, you introduced this new error.