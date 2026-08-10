---
author: 
id: B_107
internalId: 8fedf475-d0af-4fe3-9aa0-d00bdfacffa0
title: Websocket agent selection
status: new
owner: 
affects:
agents:
policy:
---

When connected through websockets (on mobile), the agent selectors are disabled. No way to set default agent config.

Also, the project config for the default agent settings is not shared over websocket, so on the action popup, the wrong agent settings are always used initially.