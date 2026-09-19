---
author: 
id: J_47
internalId: 266d68d4-69a9-4863-a0b7-bd1b9e5eed75
title: fix failing tests
status: ready
owner: 
affects:
agents:
  - design/releases/0_6_0/card__266d68d4-69a9-4863-a0b7-bd1b9e5eed75.json
policy:
after: ad96a8b4-de34-44c9-9761-c2834fd8710a
changedFiles:
  - app/src/components/actions/agent/action_agent_capability_fields.grouped.test.tsx
  - app/src/components/actions/agent/action_agent_question.grouped.test.tsx
  - app/src/components/actions/agent/action_agent_selectors.test.tsx
  - app/src/components/card_view/card_view.test.tsx
  - app/src/components/config/config_value_editor.grouped.test.tsx
  - app/src/data/agent_profiles.node.test.ts
  - app/src/data/agent_selection.node.test.ts
  - app/src/services/data/diff_service.node.test.ts
---

> The filtered rerun confirms the app-suite failures: 23 across actions_no_mock.test.tsx, config_no_mock.test.tsx, card_view.test.tsx, action_agent_selectors.test.tsx, agent_profiles.node.test.ts, agent_selection.node.test.ts, and diff_service.node.test.ts. None touch Claude usage polling, rate limits, or metrics, and none are in files I changed — they belong to the editor/config/profile WIP already in your tree. All the tests covering this fix pass.

fix failing tests. presume tests are wrong