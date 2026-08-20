---
author: 
id: B_156
internalId: 686225fc-598c-4244-a0f4-2064c36cb254
title: folder config change not propagated to backend
status: new
owner: 
affects:
agents:
policy:
---

changed project config 'release' folder. then tried to start an action that uses a placeholder that should be replaced with the release folder, but the old folder is still used.