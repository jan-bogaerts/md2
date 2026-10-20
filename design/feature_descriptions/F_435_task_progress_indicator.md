---
author: 
id: F_435
internalId: 6636980d-0f8d-4f94-a4bb-b5a171ce8891
title: task progress indicator
status: design
owner: 
affects:
agents:
policy:
---

We need to add a new component to the run button on the card popups when an action is running on the card that has a task list.

With task lists, we can show a progress bar to show how far along the agent already is. A task list, is a list, it has multiple items, so we can turn that into a progress bar.

Use a horizontal progress bar, just below the run button.

We need to be careful when loading the component, it doesn't need to be there on every run button, only those that are currently running an action.

The component should be stand alone, so it monitors the changes, it is not provided with the progress value, but with the info needed to identify task list to track.