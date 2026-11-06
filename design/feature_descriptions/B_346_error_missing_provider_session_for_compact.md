---
author: 
id: B_346
internalId: 6c050c79-a3b5-4f21-bd75-e0a82e6bde7d
title: Error: Missing provider session for compact
status: ready
owner: 
affects:
agents:
  - design/activity/card__6c050c79-a3b5-4f21-bd75-e0a82e6bde7d.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 159105123
sentryOrganization: elastetic
changedFiles:
  - app/src/components/actions/run/popup/action_prompt_menu.test.tsx
  - app/src/components/actions/run/popup/action_prompt_menu.tsx
  - app/src/services/actions/action_compact_service.node.test.ts
  - app/src/services/actions/action_compact_service.ts
  - desktop/src/actions/action/action_agent_executor.test.mjs
  - desktop/src/actions/agent/agent_runner_state.test.mjs
  - desktop/src/actions/agent/agent_streaming_event_handlers.js
---
## Sentry issue

**Title:** Error: Missing provider session for compact

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/159105123/)

**First seen:** 2026-11-06T12:09:07Z

**Last seen:** 2026-11-06T12:09:07Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** onClick(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js)

**Event ID:** 0056636d248b4bf4912380cbbc5d52ef

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:25:6718` — HTMLBodyElement.r
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:11:28333` — yf
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:11:28511` — xf
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:127805` — Yu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:15085` — Qt
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:131579` — unknown function
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:126576` — Uu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:559:27911` — o
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:2612:1960` — onClick

This occured after freshly starting the app, just opened the action popup and selected a historical conversation for the action, so no active conversation yet, but it was an existing one.

## Current state

The provider reports its Codex thread ID or Claude session ID through `sessionStarted`. `handleSessionStarted` stores that ID only on the in-memory agent run. The persisted `AgentConversation.providerSessions` entry is created later, after a successful turn completes.

Pressing Stop marks the run as cancelled. The terminal close path persists the transcript but updates the provider session only for a successful run. If Stop occurs after the provider session starts but before `turnCompleted` is handled, messages and tool activity are saved while the provider session ID is lost. After restart, normal prompting can reconstruct context in a new provider session, but Compact cannot resume the original provider session and reports `Missing provider session for compact`.

The missing-session condition is passed to `dialogService.error`, so this expected limitation is also reported to Sentry as an application failure.

## Implementation details

* When `turnStarted` is handled, require the provider session ID, update the conversation's provider session through the existing `updateProviderSession` path, and persist a checkpoint. Use the current user message as `synchronizedThroughMessageId` because the provider has accepted that turn.
* Keep the existing successful-turn update so `synchronizedThroughMessageId`, `lastUsedAt`, usage, and the final assistant message advance together after completion.
* Let Stop and application shutdown wait for queued protocol handling and checkpoint persistence before writing the terminal cancelled conversation. Do not require the run to succeed before retaining an already established provider session.
* Do not create a provider session when the provider never acknowledged a turn, and do not synthesize provider IDs or use transcript reconstruction for Compact.
* Keep backend compact identity and ownership validation. Show a genuinely missing historical provider session as an expected user-facing error without reporting it to Sentry.
* Add focused regression coverage for stopping after `sessionStarted` and `turnStarted` but before `turnCompleted`, then reloading and compacting the same Codex or Claude provider session. Retain coverage for stopping before a provider turn starts.

## Acceptance criteria

* Stopping an acknowledged Codex or Claude turn persists its provider session ID even when the turn does not complete successfully.
* Reloading the application after Stop allows Compact to resume the same persisted provider session.
* A successful turn still advances the provider session synchronization cursor to its final message and preserves existing usage accounting.
* Stopping before the provider acknowledges a turn does not create a false provider session.
* Compact continues to reject conversations that genuinely have no resumable provider session, with a clear user-facing message and no Sentry event.
* Existing compact identity, ownership, cancellation, transcript, and prompt-continuation behavior remains unchanged.
