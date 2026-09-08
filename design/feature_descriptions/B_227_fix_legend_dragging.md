---
author: 
id: B_227
internalId: e9560174-0ace-4098-9293-b0e60b449135
title: fix legend dragging
status: design
owner: 
affects:
agents:
policy:
---

when on diagram view and user drags the legend around, repaint is very slow. it seems that the entire diagram is re-rendered while dragging. this should not be the case. the position of the legend should be something only the legend needs re-rendering for.

see attached performance trace, taken of a short drag, to see what is actually going on.

[Trace-20260908T153545.json](file:///C:/Users/janbo/Documents/dev/Trace-20260908T153545.json)