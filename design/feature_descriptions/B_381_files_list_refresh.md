---
author: 
id: B_381
internalId: d09dffff-8eaf-40b4-a7b4-2a25c28f9923
title: files list refresh
status: design
owner: 
affects:
agents:
  - design/activity/card__d09dffff-8eaf-40b4-a7b4-2a25c28f9923.json
policy:
---

we already have a file watcher in the desktop which monitors file changes in the repository.

In the react app, we also have a list of all the files in the repository for auto completes in the markdown editor (triggered by the 'at' symbol.

The problem is, after changes in the folders, the files-list is not updated.

This update shouldn't happen for every change, but filechanges (adding, moving, deleting) should trigger a request to update the list, with a timeout, so we don't continuously reload the list