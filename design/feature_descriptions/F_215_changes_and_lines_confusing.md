---
author: 
id: F_215
internalId: 838f9a02-ee42-498c-b317-2f8a48075207
title: changes and lines confusing
status: new
owner: 
affects:
agents:
policy:
---

on the action popup, we show the file 'changes' and lines changed.

file changes is counted based on 'filechange' blocks in the conversation, lines changed comes from a git commit.

if both are shown, it becomes confusing. so:

* always use label 'changes'
* only show the git commit value if there is no file-change count in the conversation.