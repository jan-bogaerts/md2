---
author: 
id: F_441
internalId: 45aee390-2708-4b8b-b215-2f7ecabcabe4
title: scope provider sessions by agent account
status: ready
owner: 
affects:
agents:
  - design/releases/0.10.0/card__45aee390-2708-4b8b-b215-2f7ecabcabe4.json
policy:
after: ca17847c-ab46-4a35-9756-fe5a145ccaf2
changedFiles:
  - app/src/data/data_types.ts
  - app/src/services/agents/agent_conversation_service.node.test.ts
  - desktop/src/actions/action/action_agent_executor.js
  - desktop/src/actions/action/action_agent_executor.test.mjs
  - desktop/src/actions/action/action_compact_queue.test.mjs
  - desktop/src/actions/agent/agent_conversation.js
  - desktop/src/actions/agent/agent_conversation.test.mjs
  - desktop/src/actions/agent/agent_run_state.js
  - desktop/src/actions/agent/agent_runner_state.test.mjs
  - desktop/src/actions/agent/claude_usage_accounting.test.mjs
  - shared/agent_conversations.mjs
---

Make provider conversation ownership account-specific so a provider session is never resumed or compacted under another login.

## Current state

* `AgentConversation.providerSessions` records the provider agent, conversation ID, synchronization point, timestamps, and usage baseline.
* `ActionAgentExecutor`, `agent_conversation.js`, and `agent_run_state.js` locate provider sessions by agent, so a conversation can hold only one effective session per provider.
* Switching agents for the first time starts a new provider conversation and sends the canonical MD² conversation as context.
* Retry and compact flows assume the current agent's single global login owns the provider session.

## Implementation details

* Add optional `accountId` to each provider-session record. A missing value means that provider's initial account; do not rewrite or backfill existing conversation files.
* Treat a provider session's identity inside one `AgentConversation` as `(agent, resolved accountId)`. New and updated sessions persist the resolved account ID explicitly.
* When starting or continuing a conversation:
  * resume the provider session matching both the resolved agent and account;
  * if none exists, start a new provider conversation and send the complete canonical MD² conversation as context, matching the current first-agent-switch behavior.
* Update provider-session normalization, persistence, synchronization, retry, and missing-session recovery to preserve account identity.
* Compaction must resolve and use the account stored on the selected provider session. Current desktop defaults and action/run overrides must not redirect an existing session.
* A retry of an existing turn remains on that turn's captured account. A fallback after a missing provider conversation may create a replacement provider session only for the same agent and account.
* If a provider session references a removed account, continuation and compaction resolve through the configured default and then the initial account. An unreadable or logged-out existing account fails with an account-specific error.
* Keep multiple sessions for the same agent when their accounts differ and update only the matching session record.
* Add focused conversation, executor, runner-state, persistence, retry, missing-session, and compact tests.

## Acceptance criteria

* The same conversation can hold separate Codex or Claude provider sessions for different accounts.
* Continuing with the same agent and account resumes only that matching provider conversation.
* Selecting another account starts a separate provider session and sends the full canonical conversation context once.
* Existing provider sessions without `accountId` continue under the corresponding initial account without file migration.
* Changing account defaults or names does not change the account used for an existing provider session.
* Retry and missing-session recovery keep the resolved account identity; removed references use the defined fallback.
* An unavailable existing account produces a clear error without affecting other accounts or sessions.
