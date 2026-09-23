---
author: 
id: B_244
internalId: be1030df-8a36-4969-99af-e22e8456579f
title: open project takes too long
status: design
owner: 
affects:
agents:
policy:
---

see trace [Trace-open project.json](file:///C:/Users/janbo/Documents/dev/Trace-open%20project.json). Analyze the trace. it is taken while opening a project. this operation takes way way too long. most likely there is again a UI architecture violation where the UI keeps re-rendering while loading the project.

First tell me what is happening during the load, then make a proposal to improve.