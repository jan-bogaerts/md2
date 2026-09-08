---
author: 
id: J_47
internalId: 266d68d4-69a9-4863-a0b7-bd1b9e5eed75
title: fix failing tests
status: design
owner: 
affects:
agents:
policy:
---

> The filtered rerun confirms the app-suite failures: 23 across actions_no_mock.test.tsx, config_no_mock.test.tsx, card_view.test.tsx, action_agent_selectors.test.tsx, agent_profiles.node.test.ts, agent_selection.node.test.ts, and diff_service.node.test.ts. None touch Claude usage polling, rate limits, or metrics, and none are in files I changed — they belong to the editor/config/profile WIP already in your tree. All the tests covering this fix pass.

fix failing tests. presume tests are wrong