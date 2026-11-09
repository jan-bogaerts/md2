---
author: 
id: B_359
internalId: 5ea4f510-f3ba-4632-bde8-12a0c88335ee
title: claude cli gives authenticate failure
status: design
owner: 
affects:
agents:
  - design/activity/card__5ea4f510-f3ba-4632-bde8-12a0c88335ee.json
policy:
after: 41d340e6-afae-44bd-82e7-41ab673c94e0
---
claude cli gives this error:
\> Failed to authenticate: OAuth session expired and could not be refreshed
need to find a solution for this.

Claude cli was no longer properly logged in. we should show a better error message, with an instruction on how to fix it. I opened the claude cli manually in the folder and logged in.

perhaps we can already show a claude cli command window with the /login command ready?