---
author: 
id: B_325
internalId: 6414956f-fccd-4086-974d-cd91d67eab99
title: scheduler lost context when restarting conversation
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__6414956f-fccd-4086-974d-cd91d67eab99.json
policy:
branch: b_325_scheduler_lost_context_when_restarting_conversation
worktree: 3
after: a18b2880-10c9-4ded-b45c-29113f160478
---

I was in the middle of a conversation when the claude user account reached 100%. So I scheduled a next prompt to be sent when the account usage went back to 0.

This prompt got sent to the claude agent when the user-account -usage was reset back to 0, so far it worked. however, it did not use the previous conversation, but started a fresh new conversation which is not ok.

What needs to happen: when we schedule a new prompt for an action while the conversation was running, then the conversation needs to be continued, like normal, as is always is done when we continue an already existing conversation on a newly started agent cli

## Current state

Scheduling an agent prompt records the action, context, trigger, and prompt, but not the current conversation identity. When the schedule fires, the scheduler always allocates a new conversation ID and starts the action without `continueFrom`. The agent therefore starts a new conversation. Manual continuation already passes `continueFrom` and preserves the existing conversation.

## implementation details

- When an agent prompt is scheduled from an existing conversation, include its `AgentConversation.id` in the registration request and persist it as the schedule's optional `conversationId`.
- When a schedule has a `conversationId`, derive its activity reference from the schedule context and conversation ID. Use the reference as `continueFrom` and retain the same `conversationId` when starting the action runner.
- Before starting, verify that the stored conversation exists, belongs to the scheduled action and card, and has a resumable status. Fail the schedule with a clear error when validation fails.
- Allocate a new conversation ID only for schedules that were created without an existing conversation. Command schedules remain unchanged.
- Add focused tests for registration, persistence, runner input, validation failures, and schedules without an existing conversation.

## acceptance criteria

- A prompt scheduled from a running or waiting agent conversation continues that same `AgentConversation.id` when its trigger fires.
- The restarted agent CLI receives the persisted conversation through `continueFrom` and retains its previous context.
- The scheduler does not allocate a new conversation ID for a continuation schedule.
- A missing, terminal, or ownership-mismatched conversation fails the schedule and records a clear failure message.
- Agent schedules created without an existing conversation still start a new conversation.
- Command schedules keep their current behavior.
