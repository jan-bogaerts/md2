---
author: 
id: B_220
internalId: 43b22d3f-d24d-4e09-b222-bafec56806ae
title: git worktrees broken
status: design
owner: 
affects:
agents:
  - design/activity/card__43b22d3f-d24d-4e09-b222-bafec56806ae.json
policy:
---
* tried removing a freshly created worktree where the agent apparantly made changes in the folder. refused to delete it and said -force needed to be used.
  this is not acceptable: a git worktree needs to be removable, no matter what the state of the worktree
* removed another worktree: this appears to delete the entire folder.
  not acceptable: the app did not create the folder, so it should not delete it. user should be asked: delete folder, leave folder but delete files, let everything be.
* I accidentally tried to add an existing folder (existing worktree for another project), which correctly gave an error. but then, when I went to the other project, all worktree folders were gone from the project. the folders however were still existing, with all the content. so I tried to add the folder again, which gave an error 'spawn git ENOENT'
  so it is no longer possible to repair this project. this is also a problem