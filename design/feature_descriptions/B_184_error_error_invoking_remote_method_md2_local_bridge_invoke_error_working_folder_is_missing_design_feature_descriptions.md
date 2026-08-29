---
author: 
id: B_184
internalId: 8a886351-0de3-4d2e-bcab-9865c8fdeced
title: Error: Error invoking remote method 'md2-local-bridge:invoke': Error: Working folder is missing: design/feature_descriptions
status: design
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 142417859
sentryOrganization: elastetic
---
## Sentry issue

**Title:** Error: Error invoking remote method 'md2-local-bridge:invoke': Error: Working folder is missing: design/feature\_descriptions

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/142417859/)

**First seen:** 2026-08-23T19:29:46Z

**Last seen:** 2026-08-23T19:43:22Z

**Occurrences:** 2

**Release:** Not provided

**Environment:** production

**Culprit:** file:///C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/index.html

**Event ID:** 64fc95a18c6841aab3f193ac86702bd1

### Application stack frames

* No application stack frames provided.





Most likely, the user opened a project which was not yet initialized. none of the folders were present. but this should not generate any errors. instead, we should open a dialog that asks the user to specify the values for the special folders the app needs, with defaults filled in. User can select folders with the 'open folder' dialog. when user presses 'ok', the folders that do not exist, are created.

I though that dialog already existed?