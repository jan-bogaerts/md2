---
author: 
id: J_62
internalId: bbe6b563-0434-45c3-bb65-2218d30606b0
title: analyze start sequence traces
status: design
owner: 
affects:
agents:
  - design/activity/card__bbe6b563-0434-45c3-bb65-2218d30606b0.json
policy:
---

Starting a sequence takes a long time. the `add sequence` popup also remains open long after it is visually clear that the first action already started.

This trace is from the renderer side: [Trace-renderer start sequence.json](file:///C:/Users/janbo/Documents/dev/Trace-renderer%20start%20sequence.json)

This trace is from the desktop app: [CPU-start sequence.cpuprofile](file:///C:/Users/janbo/Documents/dev/CPU-start%20sequence.cpuprofile)

The desktop app seems to do a lot of stuff. Meanwhile, the renderer seems to wait far too long.

What is the problem here? what is the sequence in the algorithm. how can we improve?