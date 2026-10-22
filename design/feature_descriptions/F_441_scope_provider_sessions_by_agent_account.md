---
author: 
id: F_441
internalId: 45aee390-2708-4b8b-b215-2f7ecabcabe4
title: scope provider sessions by agent account
status: design
owner: 
affects:
agents:
policy:
branch: f_441_scope_provider_sessions_by_agent_account
after: ca17847c-ab46-4a35-9756-fe5a145ccaf2
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
* If a provider session references a removed, missing, unreadable, or logged-out account, continuation and compaction fail with an account-specific error. Never resume the provider conversation through the initial or another configured account.
* Keep multiple sessions for the same agent when their accounts differ and update only the matching session record.
* Add focused conversation, executor, runner-state, persistence, retry, missing-session, and compact tests.

## Acceptance criteria

* The same conversation can hold separate Codex or Claude provider sessions for different accounts.
* Continuing with the same agent and account resumes only that matching provider conversation.
* Selecting another account starts a separate provider session and sends the full canonical conversation context once.
* Existing provider sessions without `accountId` continue under the corresponding initial account without file migration.
* Changing account defaults or names does not change the account used for an existing provider session.
* Retry, missing-session recovery, and compaction never cross an account boundary.
* An unavailable referenced account produces a clear error without affecting other accounts or sessions.

