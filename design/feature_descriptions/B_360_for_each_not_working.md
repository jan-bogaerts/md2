---
author: 
id: B_360
internalId: bc624c64-1eb8-49f0-b352-5bea1077c5a6
title: for each not working
status: design
owner: 
affects:
agents:
policy:
---

tried to send a prompt with an action that has a for-each file, but we get this error:

> Failed to send
> Command failed: git check-ignore -z -- design/activity/card__3a37ac9e-5db4-4905-9d5f-1dd498825a94.json fatal: -z only makes sense with --stdin
> read {{this-card}}, we need to process the company: {{data name}} at url: {{data url}}

this is the performance trace of the main process: [main_for_each.json](file:///C:/Users/janbo/Documents/dev/main_for_each.json)

and for the renderer: [renderer_for_each.json](file:///C:/Users/janbo/Documents/dev/renderer_for_each.json)

what is going wrong?