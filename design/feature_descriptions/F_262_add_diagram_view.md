---
author: 
id: F_262
internalId: 3331f545-2396-4bb7-b421-14107e79a0d8
title: Add diagram view
status: new
owner: 
affects:
agents:
policy:
---
* Add toggle to app menu bar, before stats-view toggle. When clicked, shows diagram view
* Diagram view shows:
  * Svg component, which shows the currently active, clickable svg. Initially empty
  * Breadcrumb path for digging into the diagram and going back
  * Action popup with diagram actions.
* Initial diagram actions need to be of type ´root´.
* for digging into a diagram, we show of type ´child´. This allows us to pass in a value for ´parent-node´ placeholder when ´child diagram actions´ are triggered
* Action popup works as normal, so prompt prefilled.
* After user has run action, it has created an svg file and the action can report where the file is.
* We store a json in the design folder that keeps track, per root diagram action:
  * a list of svg files (perhaps extra props)&#x20;
  * Per svg, a list of child actions that were run with for each action again a list of svgs and child actions
* This json is loaded first time diagram view  is opened
* Last location (breadcrumb path) is saved in json and restored
* First breadcrumb represents root, next are the labels that user clicked on, which become input for the child diagram actions