---
author: 
id: B_161
internalId: 575b64d1-3ac4-41e5-ba72-eebcd3eed8cd
title: <unknown>
status: design
owner: 
affects:
agents:
  - design/activity/card__575b64d1-3ac4-41e5-ba72-eebcd3eed8cd.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 141899071
sentryOrganization: elastetic
after: 97733177-b4c8-47c3-af3d-64c31d4eca93
---
## Sentry issue

**Title:** \<unknown>

**Message:** External change ignored for design/feature\_descriptions/F\_216\_improve\_agent\_selection.md because the file has unsaved local edits.

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/141899071/)

**First seen:** 2026-08-20T17:18:28Z

**Last seen:** 2026-08-20T17:18:28Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Not provided

**Event ID:** 82d26347919a42eb815dbba515cc9eea

### Application stack frames

* No application stack frames provided.

We have had several of these errors lately. basically, it happens every time that the electron application is serving to external apps with websocket server. User creates card on remote, electron gets instruction through websocket, creates the file. then somehow, the react app running in electron does something or thinks it did something to the file causing it to be marked dirty and stored (I think) in the batch commiter. Meanwhile, the card gets updated on the external app, which syncs again through websockets, file change is noticed in electron and notifies the react app again running in electron, which still has it marked as dirty and then triggers this error. it is not an exception, so no stack frames, the error is manually entered I believe.
This is what I think is happening. There is something going wrong in the operation.