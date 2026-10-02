---
author: 
id: F_397
internalId: f51c1aaf-449b-4374-9d7c-95b2c2477535
title: fix render-update-version-script prompt
status: design
owner: 
affects:
agents:
  - design/activity/card__f51c1aaf-449b-4374-9d7c-95b2c2477535.json
policy:
---

We recently made an action that should ask an agent to inspect the repository, see which projects are in the repository and figure out which files should be updated in order to change the version number of the application.

If there are multiple buildable projects in the repository, the agent should ask if all projects should be updated, or which to update.

unfortunately, the prompt at the moment is wrong. Can you improve it?