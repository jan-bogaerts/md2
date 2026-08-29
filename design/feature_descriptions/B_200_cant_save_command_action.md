---
author: 
id: B_200
internalId: 49c227f7-c9c7-4773-a246-b4ec451244f1
title: cant save command action
status: design
owner: 
affects:
agents:
  - design/activity/card__49c227f7-c9c7-4773-a246-b4ec451244f1.json
policy:
after: 6ec1718f-1770-4446-92e5-c23a0c37da7d
---

see this trace [Trace-20260829T151109.json](file:///C:/Users/janbo/Documents/dev/Trace-20260829T151109.json)

it is taken while trying to save an action. it appears a lot is happening that should not be the case. I think it has to do with the file watcher.

can you see what is wrong, why we are not able to save a command action?