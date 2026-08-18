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
after: 32eda264-b7f3-4c65-aee1-59dd3a2a868f
---

When websocket reconnects, worktree states are not correct. Ex: app thinks worktree is still dirty from previous branch. Reloading ap fixes it