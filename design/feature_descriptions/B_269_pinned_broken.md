---
author: 
id: B_269
internalId: cb89d441-e2d8-4006-bfbb-40df58243bba
title: pinned broken
status: ready
owner: 
affects:
agents:
  - design/activity/card__cb89d441-e2d8-4006-bfbb-40df58243bba.json
policy:
after: 50bf5243-e489-4d76-9524-4933c3c78e36
changedFiles:
  - app/src/components/actions/conversation/state/action_conversation_store.node.test.ts
  - app/src/components/actions/conversation/state/action_conversation_store.ts
  - app/src/data/data_types.ts
  - app/src/services/agents/agent_integration.test.ts
  - app/src/services/agents/agent_integration.ts
  - app/src/services/agents/conversation_pin_service.node.test.ts
  - app/src/services/agents/conversation_pin_service.ts
  - app/src/services/config/config_service.service.test.ts
  - app/src/services/config/config_service.ts
  - app/src/services/data/data_service.ts
  - app/src/services/project/project_loading.ts
  - app/src/services/release_operations.service.test.ts
  - app/src/services/release_operations.ts
---
The taskbar pin badge counts two saved pin locators, but the popup shows fewer conversations.

## Cause

The badge counts locators in project configuration. The popup loads conversation records and currently resolves every project pin only from `design/activity/project.json`. Releases split completed project conversations into `design/releases/<release>/project.json` without updating their pin locators. Both pinned conversations in this project now reside in release activity files, while their locators still lack a way to find those files.

## Required behavior

- Keep `AgentConversation.id` as conversation identity. Use locations only to load records.
- For card pins, use `cardInternalId` to find the card and its current activity references, including after a release moves the card.
- For project pins, store the activity file's repository-relative path alongside the conversation ID. When a release moves a pinned conversation into its release activity file, update that pin's path as part of release completion. Pins for conversations retained in the active activity file keep the active path.
- On popup open, load only the distinct activity files identified by the pins and display the matching conversations.
- Existing project pins without paths need their locations populated so historical pinned conversations remain accessible.

Cover active and released card and project pins, plus release path updates, in focused tests.
