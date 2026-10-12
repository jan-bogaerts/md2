---
author: 
id: F_423
internalId: e552b2e5-34ae-4093-8270-daebd4467dbc
title: checking sentry too often
status: design
owner: 
affects:
agents:
policy:
---

we got this error from sentry when trying to manually retrieve the errors:

> Latest import error: Sentry request failed with status 429: You are attempting to use this endpoint too frequently. Limit is 15 requests in 1 seconds.

which is strange cause auto-retrieve is turned off.

what is going on?