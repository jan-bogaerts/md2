---
author: 
id: B_116
internalId: b0e7104c-8f81-425e-8473-66b569a63d81
title: merge agent missing card internal id
status: ready
owner: 
affects:
agents:
  - design/activity/card__b0e7104c-8f81-425e-8473-66b569a63d81.json
policy:
after: 8a177e01-b5d4-46aa-b42f-9ba11f561b60
---

When we have a merge conflict and decide to resolve it with an agent, as soon as the agent opens, we get this error:

`Missing cardInternalId for merge-conflict agent conversation context`

there is no card, so no internal id.

## Definitions

- **ActionContext**: the object describing what an action runs against. For a card it carries a `cardInternalId`; for a merge conflict it carries `conflictSessionId` / `conflictFile` and no card identity.
- **cardInternalId**: the stable per-card UUID used to own a card's persisted agent activity.
- **activity origin**: the ownership key the desktop assigns to a conversation's persisted activity files — either `{ kind: 'card', cardInternalId }` or `{ kind: 'project' }`.

## Current state

Opening a merge-conflict agent raises `Missing cardInternalId for merge-conflict agent conversation context` before any agent work starts. Cause chain:

1. `MergeConflictDialog.handleAgent` (`app/src/components/merge_conflict_dialog.tsx:118`) calls `mergeConflictService.createActionContext(path)`, producing a context with `kind: 'merge-conflict'`, `conflictSessionId`, an optional `conflictFile`, and `conflictFiles` — deliberately **without** a `cardInternalId`, because a merge conflict is not a card.
2. `ActionPopup` mounts and its `ActionConversationStore.load()` calls `defaultLoadConversations(context)` → `dataService.listAgentConversations(context)` to show prior conversations for the action.
3. `listAgentConversations` (`app/src/services/data/data_service.ts:267-272`) returns project conversations only when `kind === 'project'`; for every other kind it requires `cardInternalId` and otherwise throws. `merge-conflict` has no `cardInternalId`, so it throws. The error is caught in `ActionConversationStore.load` and shown through `dialogService` the moment the popup opens.

The assumption behind the throw is wrong for merge conflicts. On the desktop, `activityOrigin()` (`desktop/src/actions/action/action_runner_service.js:16-26`) maps any non-`card`/`file` context — merge-conflict included — to `{ kind: 'project' }`. A merge-conflict run therefore persists its conversation with `cardInternalId: null` (`desktop/src/actions/agent/agent_conversation.js:115`), i.e. as a **project-level** conversation. Merge-conflict history belongs in the project conversation list, not under a card.

A second, latent defect sits in the client filter: `belongsToContext` (`app/src/components/actions/conversation/action_conversation_store.ts:17-21`) only special-cases `project`. For a merge-conflict context it evaluates `conversation.cardInternalId (null) === context.cardInternalId (undefined)`, which is `false`. So even once conversations are listed, none would match, select, or validate for a merge-conflict popup.

## Implementation details

1. **Route merge-conflict listing to project conversations** — `app/src/services/data/data_service.ts`, `listAgentConversations`. Return `this.agents.listProjectAgentConversations()` for `kind === 'merge-conflict'` as well as `kind === 'project'`. Keep the `cardInternalId` requirement only for card-owned kinds. This matches where merge-conflict runs actually persist (project origin, `cardInternalId: null`).
2. **Treat merge-conflict as project in the client filter** — `app/src/components/actions/conversation/action_conversation_store.ts`, `belongsToContext`. Match project-level ownership (`conversation.cardInternalId === null`) for `merge-conflict` contexts, not just `project`. This makes history listing, initial selection, and `validateSelection` work for the popup.
3. **Scoping note (no bleed in practice):** the popup already filters by `actionId` (`conversationOptions` / `latestWaitingConversation`). Merge-conflict actions carry `appliesTo.kind === 'merge-conflict'` and have distinct ids from ordinary project agents, so project-agent history and merge-conflict history do not mix. Per-file and resolve-all invocations of the *same* merge-conflict action share one `actionId` and one project origin, so their past conversations appear together — accepted, because history is keyed by action, and `conflictFile` is not part of the stored conversation identity.
4. **No desktop / persistence change.** Origins, storage layout, and the action-run protocol stay as they are; only the two client read paths change.
5. **Tests** — extend `app/src/services/data/data_service.test.ts` to assert `listAgentConversations({ kind: 'merge-conflict', conflictSessionId })` resolves via `listProjectAgentConversations` and does not throw; extend `app/src/components/actions/conversation/action_conversation_store.node.test.ts` (and/or the popup tests) to assert a `null`-owned conversation belongs to a merge-conflict context. Run `npm run typecheck` and the app tests.

## Acceptance criteria

- Opening a merge-conflict agent (per-file or resolve-all) no longer raises `Missing cardInternalId for merge-conflict agent conversation context`; no error dialog appears on popup open.
- The merge-conflict popup lists prior conversations for that action (project-origin, `cardInternalId: null`) and can select one without a "belongs to another context" error.
- Card and project agent popups behave exactly as before; the `cardInternalId` requirement still holds for card-owned contexts.
- No desktop bridge, persistence, or action-run protocol change is introduced.
- Typecheck and the app test suite pass, including new coverage for the merge-conflict listing and filtering paths.