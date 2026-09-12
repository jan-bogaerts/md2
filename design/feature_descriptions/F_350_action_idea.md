---
author: 
id: F_350
internalId: eb1707b3-15c4-4a42-b86e-db35fbfd9060
title: Action idea
status: new
owner: 
affects:
agents:
policy:
---

Write a script that accepts a version number and updates the code files so that the new version number is applied. Exif there is a package.json, update the version field.

New feature required in actions: ask user for info. Currently, only version number supported, which is predefined. Once the user has given this info, it can be reused for the release function.

So in action def, new select, currently only value\=version.

When such action is started, the frontend shows the dialog first. So backend asks frontend for value and waits for response before starting rest of action.

This can be for both command and agent actions.