---
author: 
id: J_44
internalId: 906cff2c-d23c-4647-bc78-2cb5580125e2
title: verify claude token count
status: design
owner: 
affects:
agents:
  - design/activity/card__906cff2c-d23c-4647-bc78-2cb5580125e2.json
policy:
changedFiles:
  - desktop/src/actions/agent/agent_claude_events.js
  - desktop/src/actions/agent/agent_claude_events.test.mjs
  - desktop/src/actions/agent/agent_claude_streaming_adapter.js
  - desktop/src/actions/agent/agent_provider_protocol.js
  - desktop/src/actions/agent/agent_provider_protocol.test.mjs
  - desktop/src/actions/agent/agent_streaming_adapter.test.mjs
---
we need to verify if the token count coming from claude is done correctly cause it seems on the low side. lets to a comparison on how both claude and codex count the token usage and lets make certain they both use the same and correct approach.