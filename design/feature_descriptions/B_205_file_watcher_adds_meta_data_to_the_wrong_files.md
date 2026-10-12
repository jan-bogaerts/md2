---
author: 
id: B_205
internalId: 941d6509-a5a1-4f47-a9b6-a3fdd9c9c010
title: file watcher adds meta data to the wrong files
status: design
owner: 
affects:
agents:
  - design/activity/card__941d6509-a5a1-4f47-a9b6-a3fdd9c9c010.json
policy:
after: 733d678c-49a7-4409-9fa2-5fb384821513
---
only cards should have meta data, we should not try to add internalId to files that are not in the 'active cards' folder.

It seems that files like the release\_notes.md files in the 'releases' folder also contain headers with internal ids. Are these used anywhere?