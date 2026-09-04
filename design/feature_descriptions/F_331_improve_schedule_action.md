---
author: 
id: F_331
internalId: 67d4a581-6ded-4a41-a489-d079644e3e5b
title: Improve schedule action
status: new
owner: 
affects:
agents:
policy:
after: 30a808a9-ebec-4f4e-835b-dfb089c714ef
---
We currently support scheduling an action using a date and time.

We should improve this by adding different types of triggers:

* When an account usage tracker of an agent resets. Useful for when 5 hourly limit resets to 0
* When anoher card switches to a configurable state.

Next we need to add commands related to scheduling to the ´run´ menu bar:

* View active schedules: opens popup with list of currently active schedules. User can
  * Select a schedule
  * Expand to show details
  * Open (also by double click) shows card (scroll into view, select and open, or when in listview, open tab)
  * Delete
* Add sequence: opens a popup:
  * where the user can drop cards. These are shown in a column
  * select the action to run, from the top, with buttons like a regular action popup
  *