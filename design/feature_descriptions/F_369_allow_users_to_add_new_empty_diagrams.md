---
author: 
id: F_369
internalId: 522e73f4-0c67-4c35-8ce2-f6a570562479
title: allow users to add new empty diagrams
status: design
owner: 
affects:
agents:
  - design/activity/card__522e73f4-0c67-4c35-8ce2-f6a570562479.json
policy:
after: 530bdc1a-985f-434a-bfe7-acb2f7ca06b8
---
users should be able to create new empty diagrams like cards and actions.

We currently have 2 buttons on the appbar: new card, new action. we need to add `new diagram`

This adds a new diagram, switches the view to diagrams if not already there and puts it in edit mode, no section needed for read-only versions.

The new diagram button opens a context menu containing all the supported diagram types. Each context menu item creates its respective diagram type.

Legend is already filled in, a title also ex, new sequence