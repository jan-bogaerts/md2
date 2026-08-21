---
author: 
id: B_160
internalId: 97733177-b4c8-47c3-af3d-64c31d4eca93
title: <unknown>
status: design
owner: 
affects:
agents:
  - design/activity/card__97733177-b4c8-47c3-af3d-64c31d4eca93.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 141901645
sentryOrganization: elastetic
---
## Sentry issue

**Title:** \<unknown>

**Message:** External change ignored for design/feature\_descriptions/B\_154\_conversation\_selector\_disabled\_while\_conversation\_is\_running.md because the file has unsaved local edits.

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/141901645/)

**First seen:** 2026-08-20T17:39:46Z

**Last seen:** 2026-08-20T17:39:46Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Not provided

**Event ID:** 78c8b82e23cf4f929a48af831ee4c4d8

### Application stack frames

* No application stack frames provided.



We have had several of these errors lately. basically, it happens every time that the electron application is serving to external apps with websocket server. User creates card on remote, electron gets instruction through websocket, creates the file. then somehow, the react app running in electron does something or thinks it did something to the file causing it to be marked dirty and stored (I think) in the batch commiter. Meanwhile, the card gets updated on the external app, which syncs again through websockets, file change is noticed in electron and notifies the react app again running in electron, which still has it marked as dirty and then triggers this error. it is not an exception, so no stack frames, the error is manually entered I believe.
This is what I think is happening. There is something going wrong in the operation.