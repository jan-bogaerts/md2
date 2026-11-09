---
author: 
id: B_359
internalId: 5ea4f510-f3ba-4632-bde8-12a0c88335ee
title: claude cli gives authenticate failure
status: ready
owner: 
affects:
agents:
  - design/activity/card__5ea4f510-f3ba-4632-bde8-12a0c88335ee.json
policy:
after: 41d340e6-afae-44bd-82e7-41ab673c94e0
branch: b_359_claude_cli_gives_authenticate_failure
worktree: 3
changedFiles:
  - app/src/components/actions/conversation/action_conversation_chat.grouped.test.tsx
  - app/src/components/actions/conversation/errors/claude_authentication_required_error.test.tsx
  - app/src/components/actions/conversation/errors/claude_authentication_required_error.tsx
  - app/src/components/actions/conversation/errors/claude_authentication_required_event.ts
  - app/src/components/actions/conversation/events/action_conversation_event_row.tsx
  - app/src/data/data_types.ts
  - app/src/services/agents/agent_conversation_service.node.test.ts
  - desktop/main.js
  - desktop/src/actions/agent/agent_run_state.js
  - desktop/src/actions/agent/agent_runner_service.js
  - desktop/src/actions/agent/agent_runner_state.test.mjs
  - desktop/src/actions/agent/agent_streaming_event_handlers.js
  - shared/agent_conversations.mjs
---
claude cli gives this error:
\> Failed to authenticate: OAuth session expired and could not be refreshed
need to find a solution for this.

Claude cli was no longer properly logged in. we should show a better error message, with an instruction on how to fix it. I opened the claude cli manually in the folder and logged in.

perhaps we can already show a claude cli command window with the /login command ready?

## Current state

Claude reports an expired OAuth session as a failed provider result. The agent runner records the provider text as a generic conversation error and marks the run as failed. It does not identify authentication failures or tell the user how to recover.

The agent account service already checks Claude authentication with `claude auth status`. Its login operation starts a visible `claude /login` process with the selected account's environment and checks the status again after the process closes. This recovery is currently available only through Configuration > Agent accounts and is not connected to a failed conversation.

## implementation details

* Detect the known Claude authentication failure in the agent runner and confirm the selected account's state through the existing agent account status check. Do this only after a Claude failure; do not add a status process to every successful run.
* Report a structured authentication-required error containing the agent and `accountId`. Preserve the original provider message as diagnostic detail.
* Render the error as: "Claude sign-in expired. Log in again, then rerun the action." Include a **Log in** button in the conversation error.
* Make the button call the existing agent account login operation. Reuse its visible `claude /login` process and account-specific environment; do not add another terminal-launch implementation.
* Keep the failed conversation and user message unchanged. Reauthentication must not automatically rerun the action.
* Add backend tests for authentication detection and account-status confirmation, and a renderer test that verifies the message and login action. Keep the existing account login tests as coverage for the command and environment.

## acceptance criteria

* An expired Claude OAuth session produces a clear authentication-required error instead of only the raw provider failure.
* The error identifies the affected Claude account and instructs the user to log in again and rerun the action.
* Selecting **Log in** opens the existing visible Claude login flow for the account used by the failed run.
* The account login flow runs `claude /login` with the correct account environment and refreshes the account status when the process closes.
* Cancelling or failing login leaves the conversation failed and does not rerun the action.
* Non-authentication Claude failures retain their current behavior.
* Codex and generic agent failures are unaffected.
