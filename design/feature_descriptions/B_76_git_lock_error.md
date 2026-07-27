---
author: 
id: B_76
internalId: 8c0fa571-e805-47db-a32e-29d3081edcf4
title: Git lock error
status: ready
owner: 
affects:
agents:
policy:
after: 1ff51d47-1147-44ee-a4c7-2a4e3e5a5330
---
symptom: after creating a couple of tasks, this error occured:

> Command failed: git add design/feature_descriptions/F_72_scrolling_cardview_on_mobile.md
> fatal: Unable to create 'C:/Users/janbo/Documents/dev/md2/.git/index.lock': File exists.

> Another git process seems to be running in this repository, e.g.
> an editor opened by 'git commit'. Please make sure all processes
> are terminated then try again. If it still fails, a git process
> may have crashed in this repository earlier:
> remove the file manually to continue.

no other git process was running. I was editing the file after creating it.