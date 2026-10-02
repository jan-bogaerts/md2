---
author: 
id: B_255
internalId: f272b881-ecee-472a-9a0b-ab4932175147
title: scheduled task did not start
status: design
owner: 
affects:
agents:
  - design/activity/card__f272b881-ecee-472a-9a0b-ab4932175147.json
policy:
after: d3ccfd9e-0ccb-4a0b-8e4a-728607d1dcd9
changedFiles:
  - desktop/src/actions/action/action_runner_service.js
  - desktop/src/actions/action/action_runner_service.test.mjs
  - desktop/src/actions/action/action_scheduler_service.test.mjs
---

a task that was scheduled to run at a specific hour, at the same day, did not start