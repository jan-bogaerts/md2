---
author: 
id: B_80
internalId: e69b9faf-30dd-4ad6-9d99-7e6af4d18c76
title: worktree selector not updated
status: design
owner: 
affects:
agents:
policy:
after: 0f5a1edf-4b4e-4dea-8c7a-05df83ae1288
---
after the 'integrate into project' command is run on a card that is assigned to a worktree, the worktree selector icon is not updated and the wrong state is shown on the card. if the user clicks again on the icon and runs the 'integrate into project' again, the app gives an error to say nothing left to integrate. then the icon gets updated correctly