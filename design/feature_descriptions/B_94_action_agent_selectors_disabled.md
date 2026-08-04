---
author: 
id: B_94
internalId: d00ed22e-f395-4949-9b0f-ce1c2275c31e
title: action-agent-selectors disabled
status: ready
owner: 
affects:
agents:
  - design/activity/card__d00ed22e-f395-4949-9b0f-ce1c2275c31e.json#conversation=agent-533e0930-265f-4f69-be03-b18620cb5c6f
  - design/activity/card__d00ed22e-f395-4949-9b0f-ce1c2275c31e.json#conversation=agent-0e6f8507-979b-4734-94db-2133cadada7b
policy:
after: 50ec96d2-8e7c-471a-a33b-9cbd4210b5cb
worktree: 2
---

the action-agent-selectors on the action-popup are only enabled when the conversation has not yet started. It is not possible to change a model setting in the middle of a conversation.

This should not be the case. When a conversation has started and the agent is no longer working (so waiting for input from the user), then it is always possible to restart the agent with a different model or security setting and reload the conversation.

The selectors should be disabled while the agent is working (producing output)

## Current state

`ActionAgentSelectorsOwner` treats `queued`, `running`, and `waitingForInput` as one active session and disables every agent selector. `runPopupAction` also sends follow-up text directly to the existing streaming process while waiting, so changed run settings would not be applied.

Conversation checkpoints already contain the path and provider sessions needed to continue through a newly started agent process. `ActionAgentExecutor` resolves model and security overrides when that process starts.

## implementation details

- Disable selectors only while status is `queued` or `running`; enable them during `waitingForInput`.
- Record selector changes made while waiting. Do not restart agent when selection changes.
- On next Send, keep current direct-message path when settings did not change. When settings changed, finish idle streaming run, wait for terminal persistence, then start normal continuation from its conversation path with current agent, model, thinking, access, and approval settings.
- Never run two processes for same conversation concurrently. Keep prompt intact if finishing or restarting fails, and report error through `dialogService`.
- Keep selectors disabled for unsupported capabilities and preserve question and approval blocking rules.
- Add renderer tests for selector status and unchanged-versus-changed follow-up paths; add bridge/backend coverage for ordered finish, reload, and restart.

## acceptance criteria

- Agent selectors are enabled whenever conversation waits for user input and disabled while agent is queued or producing output.
- Changing selector while waiting does not immediately restart agent.
- Next Send restarts agent with changed settings and continues same conversation, including existing transcript.
- Sending without changed settings continues through existing process.
- Restart waits for old process and conversation persistence; no overlapping conversation turn occurs.
- Restart failure preserves unsent prompt and shows error.
