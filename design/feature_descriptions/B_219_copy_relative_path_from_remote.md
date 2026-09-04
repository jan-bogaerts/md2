---
author: 
id: B_219
internalId: 30a808a9-ebec-4f4e-835b-dfb089c714ef
title: copy relative path from remote
status: new
owner: 
affects:
agents:
policy:
after: 0a0fa053-2cfc-497e-9bb4-c3440ddb8638
---

When the react app is connected to the electron app through a websocket, we don't correctly handle the commands 'copy path' an 'copy relative path': they give an error.

this is not correct: we should still allow to copy the path and relative path.