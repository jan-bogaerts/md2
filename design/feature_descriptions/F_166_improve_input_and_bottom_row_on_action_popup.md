---
author: 
id: F_166
internalId: 1ebcfe45-9445-47e6-8619-6c72708bd91b
title: Improve input and bottom row on action popup
status: new
owner: 
affects:
agents:
  - design/activity/card__1ebcfe45-9445-47e6-8619-6c72708bd91b.json#conversation=agent-d07918ff-494f-49f9-bd94-83b66ca6a75e
policy:
---
We need to improve layout and position of input and bottom row. The goal is to provide as much viewing area as possible to the chatlog while providing optimal input size while editing a prompt.

The bottom row should be inside the box of the input, sticky to the bottom, so no longer a gray bar at the bottom of the popup.

When the input box has no value (empty), it should be 1 line high, box itself ofcourse more for border and bottom row. The resize bar should be disabled.

When it has a value, the box can be enlarged to its last size. Resize bar is enabled again.