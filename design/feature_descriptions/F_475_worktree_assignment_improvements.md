---
author: 
id: F_475
internalId: 20a597ec-9ca8-4ae1-a47e-a8c2d7279fbf
title: worktree assignment improvements
status: design
owner: 
affects:
agents:
  - design/activity/card__20a597ec-9ca8-4ae1-a47e-a8c2d7279fbf.json
policy:
after: c8fdbf7f-e685-4590-8532-4103d2d68287
---
Assigning a card to a worktree (using the button on the card), can take a little bit of time. enough for the user to wonder if anything is happening. I am not certain why this is exactly, so I took a performance trace of both desktop and renderer:

This is the performance trace of the desktop app: [CPU-assignworktree.cpuprofile](file:///C:/Users/janbo/Documents/dev/CPU-assignworktree.cpuprofile)

this is the performance trace of the renderer: [Trace-assign worktree.json](file:///C:/Users/janbo/Documents/dev/Trace-assign%20worktree.json)

In this run, it is already faster cause I had already assigned the card previously to the same worktree, so the branch probably already existed and the worktree had the correct code loaded.

So lets first analyze what exactly is done when user assigns and then the second operation, updates the worktree. Are there any places where we could improve.

secondly, we will need to show some feedback to the user that the operation is in progress. maybe by a spinning border? we already have something similar for the 'run' button.