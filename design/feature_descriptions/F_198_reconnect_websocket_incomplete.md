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
after: 38781d24-46e6-4824-9587-b95bf62a0738
---

When websocket reconnects, worktree states are not correct. Ex: app thinks worktree is still dirty from previous branch. Reloading ap fixes it