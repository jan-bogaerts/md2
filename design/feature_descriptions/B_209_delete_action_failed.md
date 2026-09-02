---
author: 
id: B_209
internalId: ccff9568-68bb-468f-85e7-37d06bd37b59
title: delete action failed
status: new
owner: 
affects:
agents:
policy:
after: b4c6118b-6976-41ec-b33e-bd93e66eda89
---

* create new action
* before it is saved as a file and committed, delete it
* system gives error that it can't delete the file and doesn't remove the file from the in memory data

this is wrong: if the file was not yet saved, we should not throw an error that we can't delete the file. if it doesn't exist, just remove it from the in-memory loaded data and make certain that there is no entry in the batch-committer for the file.