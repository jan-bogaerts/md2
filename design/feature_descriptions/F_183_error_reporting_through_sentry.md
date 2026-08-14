---
author: 
id: F_183
internalId: 715f1a07-796d-4a83-bed9-bd3527584dce
title: error reporting through sentry
status: new
owner: 
affects:
agents:
  - design/activity/card__715f1a07-796d-4a83-bed9-bd3527584dce.json#conversation=agent-d01ef4eb-dd75-4451-a8ee-53a15089b636
policy:
---

it seems the application is not reporting captured errors to sentry. this is not ok, all errors in production should be reported through sentry.

Whenever `dialogservice.error` is called, the error needs to be reported to sentry