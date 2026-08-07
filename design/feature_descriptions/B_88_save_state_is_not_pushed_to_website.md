---
author: 
id: B_88
internalId: eeb46f0d-77d7-4a9d-a83e-b64e9101b994
title: save state is not pushed to website
status: design
owner: 
affects:
agents:
  - design/activity/card__eeb46f0d-77d7-4a9d-a83e-b64e9101b994.json#conversation=agent-1761ff54-8fbc-4165-a11d-61ff90293784
policy:
---

the website does appear to update the save-state, but it seems independent of the electron app, so I think the front-end is controlling this which is a problem.

The backend should flush changes and notify the front end that everything has been saved.
if we don't do this, then it becomes possible that there is a conflict when trying to save a file cause ex: the website changed something and the backend also updated the card, marking it dirty in 2 different places. this can give the following error:

External change ignored for design/feature\_descriptions/F\_100\_when\_waiting\_for\_input\_timer\_should\_stop.md because the file has unsaved local edits.&#x20;