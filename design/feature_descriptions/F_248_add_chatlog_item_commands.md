---
internalId: 3ca60eff-65bc-44d0-929f-451e034102c4
id: F_248
status: design
title: add chatlog item commands
---
for chatlogs items, add buttons that allow:

* copy: copy markdown
* split: create a new conversation which is a duplicate of the current one, but drop everything after the split point. Could be that agents have special commands for this that might generate new conversation ids and such
* save:
  * First prompt: always save as new action
  * Others: save as action and save as response phrase for current action.