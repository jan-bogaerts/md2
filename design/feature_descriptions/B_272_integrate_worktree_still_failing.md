---
author: 
id: B_272
internalId: 03ba1df1-2c57-4c20-b3f8-cfff40547b34
title: integrate worktree still failing
status: design
owner: 
affects:
agents:
  - design/activity/card__03ba1df1-2c57-4c20-b3f8-cfff40547b34.json
policy:
---
still getting this error:

> Primary worktree changed after pending saves were flushed; save changes and retry integration

the sequence is still not ok. we looked at this before. please think long and hard about this one. The solution here is not to flush multiple times but to not change any files after committing and wait until the entire process is done.