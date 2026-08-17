---
author: 
id: F_202
internalId: 2ba8b222-8131-4283-9263-be319a8fed6f
title: improve manual sentry import
status: new
owner: 
affects:
agents:
policy:
after: d2b29755-4cca-4721-8754-06342fa86323
---

currently:

> Manual import exists only in config page:

> Config > Sentry > Import now

> Automatic import setting does not control this button. Button enables when:

> Sentry connection is authenticated.
> All Sentry/card settings are complete.
> Project is writable.
> No import currently runs.
> No menu, toolbar, command palette, or project-level action exists elsewhere. So discoverability is poor; user must reopen Sentry config to import manually.