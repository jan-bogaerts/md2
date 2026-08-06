---
author: 
id: B_92
internalId: c9e7dccb-d263-4ba6-98fc-b4361a01bf4d
title: click on link to code not working
status: design
owner: 
affects:
agents:
  - design/activity/card__c9e7dccb-d263-4ba6-98fc-b4361a01bf4d.json#conversation=agent-98813ed6-0907-475d-a831-9e4c10492ddb
policy:
---

error:

Local file link target does not exist: vidsy\_ai\_electron/src/services/analysis/frame\_rules/\_*\_tests*\_\_/frame\_rules\_service.test.js:12



the agent will return the files local to it's working folder, so that's where we should search for the files to open

also, these files should be opened by an external app. currently just start vscode, but this should be a config parameter for the application (not project specific, but global to the app)