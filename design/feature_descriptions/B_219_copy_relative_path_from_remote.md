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
after: 1d05ed50-60c4-42a5-b520-fbc0d625361c
---

When the react app is connected to the electron app through a websocket, we don't correctly handle the commands 'copy path' an 'copy relative path': they give an error.

this is not correct: we should still allow to copy the path and relative path.