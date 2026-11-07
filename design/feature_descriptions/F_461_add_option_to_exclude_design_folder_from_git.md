---
author: 
id: F_461
internalId: f3b7a6f7-0cc4-4d30-994b-026f9d5d8092
title: add option to exclude design folder from git
status: design
owner: 
affects:
agents:
policy:
after: 41d340e6-afae-44bd-82e7-41ab673c94e0
---

We currently have the [commit_batcher.ts](app/src/data/commit_batcher.ts), it saves all files and commits them to git.

But, we sometimes don't want to commit the design folder and instead just keep it local. So we should add a configuration option (on project level) that allows the user to turn on/off if the design folder is committed or not.

This option should also be available when opening a project for the first time and we show the dialog for setting up the project folders. By default, the 'include in git' flag should be off, so the design folder should not be committed.

Also, when turned off, we need to add the folder to the git ignore list and remove it when turned on. This can perhaps be a bit of a tricky situation cause we need to make certain git doesn't trip up when we exclude a folder.