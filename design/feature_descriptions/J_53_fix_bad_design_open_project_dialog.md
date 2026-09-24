---
author: 
id: J_53
internalId: b0464662-3032-43b7-a9a6-ec3e42da96ed
title: fix bad design open project dialog
status: design
owner: 
affects:
agents:
  - design/activity/card__b0464662-3032-43b7-a9a6-ec3e42da96ed.json
policy:
changedFiles:
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/shell/menu/app_menu.tsx
  - app/src/components/shell/project/project_dialogs.test.tsx
  - app/src/components/shell/project/project_open_dialog.test.tsx
  - app/src/components/shell/project/project_open_dialog.tsx
  - app/src/components/shell/project/use_project_toolbar_menu_actions.ts
  - app/src/components/shell/project_toolbar_menu.tsx
---
The ProjectOpenDialog is extremely poorly designed. it uses an enormous amount of event handlers that should be done internally. An extremely complex system has been set up to pass along these event handlers which appear to be coming from hooks. This is against the design guidelines of the project.

And why is it used in 2 different places, that also makes no sense