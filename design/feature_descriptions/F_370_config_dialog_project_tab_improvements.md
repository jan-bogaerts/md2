---
author: 
id: F_370
internalId: 1e7b5718-e065-479d-9d50-be0ff38d738f
title: config dialog project tab improvements
status: design
owner: 
affects:
agents:
policy:
---
we need to improve the layout of the project tab on the config dialog:

* the first section is a list of input from project-folder to archive folder. these should be grouped together, title 'folders' with a short explanation with this is about.
* diagram footer should be moved down to the end
* all git related configs should be grouped, title 'git' with explanation (so diff command, push mode)
* card related configs should be grouped: card separator, card types, columns
* for card types, instead of editing a row array, lets create a custom component, that allows the user to add, delete the types, show the color as background of the button that represents the type. when clicked, user can edit details. use color picker to set the color, inputs for the others.
* similar for columns: create a custom component with buttons