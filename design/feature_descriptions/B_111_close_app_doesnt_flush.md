---
author: 
id: B_111
internalId: 43bf8521-8caa-4127-88fc-c31454193b90
title: close app doesnt flush
status: new
owner: 
affects:
agents:
policy:
after: 385eccb9-06c4-4d93-8f8a-5f9b9f42e45f
---

When the app is about to be closed, any changes should be flushed before terminating the app.

this should be the case both for when running in electron and when running in a browser.