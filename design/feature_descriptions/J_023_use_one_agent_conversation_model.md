---
author:
id: J-023
internalId: 1244ac27-293a-4a5f-b478-0890ecc3fea6
title: use one agent conversation model while growing and persisted
status: ready
owner:
affects:
  - app/src/data/action_run_types.ts
  - app/src/data/data_types.ts
  - app/src/services/actions/action_execution_service.ts
  - app/src/components/actions/use_action_popup_controller.ts
  - desktop/src/actions/action/action_execution.js
  - desktop/src/actions/agent/agent_runner_service.js
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Follow J-020 by removing the remaining `LiveAgentTurn` model. A growing conversation and a persisted conversation are the same `AgentConversation`; persistence is only a lifecycle state.

## Current problem

J-020 unified conversation content into `entries`, but renderer run state still stores `LiveAgentTurn`. `useActionPopupController` converts that object into a new `AgentConversation` during rendering. This duplicates models, metadata, and ownership.

## Required change

- Remove `LiveAgentTurn` and `liveAgentConversation`.
- Store `AgentConversation | null` directly in run state.
- Make the agent-start event provide the complete canonical conversation snapshot, including identity, metadata, path, status, and initial entries.
- Apply later message/event updates immutably to that conversation's `entries` without changing entry order.
- Apply status and completion metadata to the same model.
- Persist and reload the same `AgentConversation` shape.
- Continuation starts from the canonical source conversation and adds new entries without a renderer-side merge.
- Do not add live/persisted adapters, compatibility shapes, or duplicated fields.

## Acceptance criteria

- [ ] `LiveAgentTurn` and `liveAgentConversation` no longer exist.
- [ ] Growing, completed, persisted, loaded, and continued conversations all use `AgentConversation`.
- [ ] Run state exposes the canonical conversation directly.
- [ ] Popup rendering performs no conversation-shape conversion or history merge.
- [ ] Entry identity and order remain stable during streamed updates.
- [ ] App and desktop lint and tests pass.

## Dependency

J-020 must be implemented first.
