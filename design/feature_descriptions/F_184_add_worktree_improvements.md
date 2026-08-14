---
author: 
id: F_184
internalId: bd257fa5-fafa-425b-be61-73a090e1ccf5
title: add worktree improvements
status: design
owner: 
affects:
agents:
  - design/activity/card__bd257fa5-fafa-425b-be61-73a090e1ccf5.json#conversation=agent-f7330047-51cc-4ab7-b247-8cf20866fb19
policy:
---

after selecting a folder, the spinner on the 'folder tree' keeps spinning for some time while git is setting up the folder.

* problem: this setup happens immediately when folder is added, which negates the 'save' and 'cancel' buttons.
  what should happen:
  * add folder to temp list without setting up git
  * if user presses cancel, folders don't get set up, don't get saved in config
  * if user saves settings, spinner should be shown with text to explain that app is setting up worktrees with git