---
author: 
id: B_125
internalId: 6d6bf2a1-f9ac-430c-ad48-255ae837c9a0
title: Error: Error invoking remote method 'md2-local-bridge:invoke': Error: Activity conversation not found: agent-f721f7b5-85e5-4665-bd28-0bfdd83b79db
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__6d6bf2a1-f9ac-430c-ad48-255ae837c9a0.json#conversation=agent-86b031c9-95f2-4a94-9bb6-fde76003a763
  - design/activity/card__6d6bf2a1-f9ac-430c-ad48-255ae837c9a0.json#conversation=agent-a14cd2a6-7e2f-475f-90e5-9816f513b4ae
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 140879683
sentryOrganization: elastetic
branch: b_125_error_error_invoking_remote_method_md2_local_bridge_invoke_error_activity_conversation_not_found_agent_f721f7b5_85e5_4665_bd28_0bfdd83b79db
worktree: 3
---
# Goal

Store one activity-file reference on a card instead of one compound reference per conversation. Load the referenced activity file once and attach all conversations it contains. This removes the reservation race because the activity file exists before its path is added to the card, even though its first conversation does not yet exist.

## Current state

Each card has one activity JSON file. The file is created from the card's stable `internalId`, and every conversation in that file belongs to that card. No other card action may write conversations into it.

The card's `agents` frontmatter currently stores one compound `<activity-path>#conversation=<conversation-id>` reference for every conversation. `AgentIntegration` loads every reference separately, so several references to the same activity file cause repeated reads and parses of that file. The reference order duplicates ordering already owned by the activity file's `conversations` array.

Before a new card agent starts, `runElectronAction` reserves a conversation ID. `ActionRunnerService.reserveConversation` creates a valid activity file with an empty `conversations` array. React then adds the reserved compound conversation reference to the card, flushes the Markdown change, and starts the action. A project-watch reload can follow the new reference before the first checkpoint persists the conversation. Electron loads the existing activity file, cannot find the reserved conversation ID, and throws `Activity conversation not found`.

## implementation details

- Change card `agents` entries from compound conversation references to repository-relative activity-file paths. A normal card has zero or one entry. Adding the same file path again is a no-op.
- Keep compound `<activity-path>#conversation=<conversation-id>` references as runtime addresses for operations on one conversation, including continuation, viewed-state updates, waiting-conversation closure, and terminal-event loading. Do not persist those compound references in card Markdown.
- Include the activity path in the conversation reservation result. `runElectronAction` adds that file path to the card, flushes the card change when needed, and then starts the action with the reserved conversation ID and runtime conversation reference. Preserve the existing reserve, link, flush, start ordering.
- Add a storage operation that loads one activity file and returns all conversations in its `conversations` array. Local Electron, GitHub, and remote WebSocket storage must expose the same behavior. `AgentIntegration` calls it once per card activity file and attaches every returned conversation.
- When attaching a referenced activity file, do not require its stored `origin.cardInternalId` or its conversations' stored `cardInternalId` to match the referencing card. The explicit file reference determines where the conversations are shown, allowing users to copy cards or activity files manually. Keep normal activity schema validation and repository path-safety checks.
- Give each loaded conversation its compound runtime reference by combining the card's referenced activity path with the conversation's ID. Keep strict single-conversation lookup for operations that explicitly address one conversation.
- Use the activity file's `conversations` array as the persisted conversation order. Do not maintain a second order in card Markdown.
- Treat a valid activity file with no conversations as a successful load that attaches an empty list. Missing files, malformed activity JSON, unsafe paths, and failures to read the referenced file remain errors.
- Remove the proposed pending-reference detection, nullable conversation result, and special `null` handling. They are unnecessary when project/background loading does not look up a reserved conversation ID.
- When releasing a card, move its activity file as before and rewrite the card's single activity-file path. Do not enumerate, preserve, or rewrite conversation IDs in the card frontmatter.
- Migrate existing card frontmatter by removing `#conversation=...` from its entries and deduplicating the resulting activity paths. Under the existing ownership invariant, all entries for one card resolve to the same path. If they resolve to more than one distinct path, report the conflict instead of silently choosing one. Persist migrated card changes through the normal batched card-save path.
- Update activity repair so it validates and repairs each referenced file once. Repair no longer removes a card reference because an individual conversation ID is absent or belongs to a different card. File-level load and repair failures retain the existing reporting and batching behavior.

## acceptance criteria

- A card with any number of conversations stores one activity-file path in `agents`; it stores no `#conversation=...` fragments.
- Project and background loading read and parse that activity file once and attach every conversation in its `conversations` array.
- A referenced valid activity file with an empty `conversations` array loads without an error, warning dialog, or telemetry event in Electron and connected browsers.
- Starting a new card agent creates the activity file before linking its path. Watcher reloads during reservation produce no `Activity conversation not found` error and require no pending-reference exception.
- Live conversations still arrive through action-run events. After checkpoint or terminal persistence, project reload attaches the stored conversation without adding another Markdown reference.
- Conversation continuation, viewed-state updates, waiting-conversation closure, and terminal-event loading still address the intended conversation through an in-memory compound reference and retain strict missing-conversation errors.
- Conversation display does not depend on stored activity origin or conversation `cardInternalId` matching the referencing card.
- Releasing a card moves one activity file and rewrites one file reference while preserving all conversations and history.
- Existing compound card references migrate to one deduplicated activity-file path in a normal batched save. Multiple distinct paths produce a reported conflict and no arbitrary selection.
- Missing activity files, malformed activity data, unsafe paths, and I/O failures retain their existing error behavior.
- Activity schema, conversation persistence, and reserve/link/flush/start ordering remain unchanged outside the reference-model change.

## testing

- Cover reservation followed by watcher reload before conversation persistence for local Electron and WebSocket clients.
- Cover empty, single-conversation, and multiple-conversation activity files, proving one file load and complete attachment in stored order.
- Cover manual file references whose stored origin or conversation card identity differs from the referencing card.
- Cover runtime compound references for continuation, viewed-state updates, waiting-conversation closure, and terminal loads.
- Cover migration from several compound references to one path, duplicate paths, conflicting paths, migration batching, and migration failure.
- Cover release moves and reference rewriting with zero, one, and several conversations in the activity file.
- Keep malformed-file, missing-file, unsafe-path, and strict explicit conversation lookup regression coverage.

## Sentry issue

**Title:** Error: Error invoking remote method 'md2-local-bridge:invoke': Error: Activity conversation not found: agent-f721f7b5-85e5-4665-bd28-0bfdd83b79db

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/140879683/)

**First seen:** 2026-08-15T17:59:28Z

**Last seen:** 2026-08-15T18:03:09Z

**Occurrences:** 3

**Release:** Not provided

**Environment:** production

**Culprit:** file:///C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/index.html

**Event ID:** 3e9a2524e9334246a4c2de5ff6d05e82

### Application stack frames

* No application stack frames provided.



note: occurred in electron-react while another web browser was connected through websocket and change occured in web browser that triggered update in electron-react
