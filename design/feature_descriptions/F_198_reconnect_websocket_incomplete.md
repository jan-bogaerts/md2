---
author: 
id: F_198
internalId: f5e9bc66-ebde-41f7-ae6e-503e9e8e284a
title: Reconnect websocket incomplete
status: new
owner: 
affects:
agents:
policy:
after: 328fa8a7-573d-4665-87db-c44a7c133559
---

When websocket reconnects, worktree states are not correct. Ex: app thinks worktree is still dirty from previous branch. Reloading ap fixes it