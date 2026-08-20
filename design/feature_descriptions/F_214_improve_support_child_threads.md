---
author: 
id: F_214
internalId: 10a50270-fcab-4661-9d29-d966aa99eb1e
title: improve support child threads
status: new
owner: 
affects:
agents:
policy:
after: 686225fc-598c-4244-a0f4-2064c36cb254
---

codex can use child threads. currently we either ignore them or print them in the main conversation thread.

Not certain if claude has similar concept.

we should show in the ui that sub threads are running.

need to think some more on how best to show visually. codex uses sub-converations where a user can click on the thread and that opens the sub conversation. with arrow can go back to root conversation