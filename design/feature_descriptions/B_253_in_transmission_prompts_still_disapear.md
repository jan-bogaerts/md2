---
author: 
id: B_253
internalId: bde0d7b3-85f0-46c0-8027-5d56939c04ee
title: in-transmission prompts still disapear
status: to fix
owner: 
affects:
agents:
  - design/activity/card__bde0d7b3-85f0-46c0-8027-5d56939c04ee.json
policy:
changedFiles:
  - app/src/components/actions/conversation/state/action_conversation_store.node.test.ts
  - app/src/components/actions/conversation/state/action_conversation_store.ts
  - app/src/components/actions/conversation/transcript/action_conversation_chatlog_tracker.ts
  - app/src/components/actions/conversation/transcript/action_queued_prompt.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_run_registry.ts
  - desktop/src/actions/agent/agent_runner_service.js
  - desktop/src/actions/agent/agent_runner_state.test.mjs
---
See [F\_383\_prompts\_need\_to\_be\_shown\_faster.md](design/releases/0_7_0/F_383_prompts_need_to_be_shown_faster.md) where we improved the way prompts are shown in the conversation log.

I notice though there is still a visible switch between in-transmission conversation-items and the regular conversation-log-item. The in-transmission prompt disappears and then comes back as a regular prompt. why is this? how come that there is a separate 'remove' that forces a UI refresh? It looks extremely fishy, as if something is happening in between? this should not be the case, the in-transmission item should only be replaced by the actual event at the time we get the ack on the prompt. so it should be a simple replace, which it doesn't appear to be. why?