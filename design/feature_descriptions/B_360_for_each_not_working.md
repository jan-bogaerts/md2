---
author: 
id: B_360
internalId: bc624c64-1eb8-49f0-b352-5bea1077c5a6
title: for each not working
status: ready
owner: 
affects:
agents:
  - design/activity/card__bc624c64-1eb8-49f0-b352-5bea1077c5a6.json
policy:
changedFiles:
  - app/src/data/action_run_types.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_run_registry.ts
  - desktop/src/actions/action/action_agent_executor.js
  - desktop/src/actions/action/action_agent_executor.test.mjs
  - desktop/src/actions/action/action_compact_queue.test.mjs
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
  - desktop/src/actions/action/action_runner_service.js
  - desktop/src/actions/action/action_runner_service.test.mjs
  - desktop/src/actions/action/action_scheduler_service.test.mjs
  - desktop/src/actions/activity/activity_files.js
  - desktop/src/actions/activity/activity_files.test.mjs
  - desktop/src/actions/agent/agent_conversation_persistence.js
  - desktop/src/actions/agent/agent_conversation_persistence.test.mjs
  - desktop/src/actions/agent/project_agent_token_usage.js
  - desktop/src/actions/agent/project_agent_token_usage.test.mjs
---

tried to send a prompt with an action that has a for-each file, but we get this error:

> Failed to send
> Command failed: git check-ignore -z -- design/activity/card__3a37ac9e-5db4-4905-9d5f-1dd498825a94.json fatal: -z only makes sense with --stdin
> read {{this-card}}, we need to process the company: {{data name}} at url: {{data url}}

this is the performance trace of the main process: [main_for_each.json](file:///C:/Users/janbo/Documents/dev/main_for_each.json)

and for the renderer: [renderer_for_each.json](file:///C:/Users/janbo/Documents/dev/renderer_for_each.json)

what is going wrong?