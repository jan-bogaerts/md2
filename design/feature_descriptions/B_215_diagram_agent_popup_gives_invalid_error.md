---
author: 
id: B_215
internalId: 7b0ea8f9-7db3-44dd-8372-7103eca2324d
title: diagram agent popup gives invalid error
status: ready
owner: 
affects:
agents:
  - design/activity/card__7b0ea8f9-7db3-44dd-8372-7103eca2324d.json
policy:
---

when opening the action popup when in diagram view, and it prepares the prompt, we get this error:

Missing cardInternalId for diagram agent conversation context

we are not working with cards, so this error should not be thrown. we have seen this error before, seems a bit of overengineering that needs simplification: only cards have internalId, so we need to stop giving errors when not on cards.


## Current state

Terms used below: an **action context kind** is the `kind` field on `ActionContext` (`app/src/data/action_context.ts`), one of `card`, `diagram`, `file`, `folder`, `merge-conflict`, `project`. An **activity origin** is the ownership record that decides which activity file a run's conversation is written to: `{ kind: 'card', cardInternalId }` maps to `activity/card__<internalId>.json`, `{ kind: 'project' }` maps to `activity/project.json` (`shared/activity_paths.mjs`).

Only cards carry an `internalId`. `cardContext` sets `cardInternalId`; `diagramContext`, `folderContext` and `projectContext` never do, and `fileContext` only sets it when the markdown file happens to be a card, as its own comment states.

The desktop side already accepts that. `activityOrigin` in `desktop/src/actions/action/action_runner_service.js:19` returns a project origin for every kind except `card` and `file`, so a diagram run's conversation is written to `activity/project.json` with `cardInternalId: null`. The renderer never learned the same rule, which is where the reported error comes from.

Causal chain for the reported failure, in order:

1. The user opens the action popup in diagram view. `ActionPopupFrame` always mounts `ActionConversationPickerOwner`, whose mount effect calls `store.load()` (`app/src/components/actions/conversation/action_conversation_picker_owner.tsx:73`).
2. `ActionConversationStore.load` calls `defaultLoadConversations(context)`, which is `dataService.listAgentConversations(context)`.
3. `listAgentConversations` (`app/src/services/data/data_service.ts:270`) routes only `project` and `merge-conflict` to `listProjectAgentConversations()`. A `diagram` context falls through to the card branch and hits `if (!context.cardInternalId) throw new Error(...)` on line 272.
4. `load` catches the throw and surfaces it through `dialogService.error`, producing the dialog `Missing cardInternalId for diagram agent conversation context`.

Prompt preparation is not the cause. `defaultPreparePrompt` and the popup's conversation load both start when the popup opens, so the error appears at the same moment the prompt is being prepared and looks like it comes from there.

A second, currently masked defect sits behind the same assumption. `belongsToContext` (`app/src/components/actions/conversation/action_conversation_store.ts:23`) compares `conversation.cardInternalId === context.cardInternalId` for every kind other than `project` and `merge-conflict`. A project-origin conversation has `cardInternalId: null` and a diagram context has `cardInternalId: undefined`, so the strict comparison is false. Fixing only step 3 would return the conversations and then filter them all out of the picker, and `validateSelection` would throw `Selected agent conversation belongs to another context` on selection.

The same shape of bug exists for two more contexts that nobody has reported yet:

* A `folder` context reaches the card branch of `listAgentConversations` and throws exactly as `diagram` does.
* A `file` context for a plain markdown file that is not a card carries no `cardInternalId`, so `activityOrigin` in `desktop/src/actions/action/action_files.js:27` throws `Card action history requires cardInternalId` when the popup loads run history, and the equivalent function in `action_runner_service.js:19` throws `Card-origin action requires cardInternalId` when such an action runs.

## Implementation details

The rule, applied in every place that currently branches on kind: **conversation and history ownership follows the presence of `cardInternalId`, not the context kind.** A context with a `cardInternalId` is card-owned; every context without one is project-owned. No kind-specific list, and no throw.

This matches what the runner already writes to disk, so diagram, folder and non-card file popups will list the project conversations their own runs create, filtered per action id as they already are for project actions.

1. `app/src/services/data/data_service.ts:270` — replace the kind check and the throw in `listAgentConversations` with a `cardInternalId` check: return `this.agents.ensureAgentConversationsForCard(context.cardInternalId)` when the id is present, otherwise `this.agents.listProjectAgentConversations()`.
2. `app/src/components/actions/conversation/action_conversation_store.ts:23` — rewrite `belongsToContext` to the matching rule. Compare against `context.cardInternalId ?? null` so a project-origin conversation (`cardInternalId: null`) matches a context that has no card identity, whatever its kind.
3. `desktop/src/actions/action/action_runner_service.js:19` — `activityOrigin` returns a card origin when `context.cardInternalId` is a non-empty string, otherwise `{ kind: 'project' }`. Drop the `Card-origin action requires cardInternalId` throw and the `kind === 'card' || kind === 'file'` test.
4. `desktop/src/actions/action/action_files.js:27` — apply the same change to the history `activityOrigin`, dropping the `Card action history requires cardInternalId` throw.

Leave alone, because these guard genuine invariants rather than the kind assumption:

* `cardContext` throwing when a card has no `internalId` (`app/src/data/action_context.ts`). A card without an internal id is a real data fault.
* The `autoFinish` card requirement in `desktop/src/actions/action/action_run.js:415`, which is a deliberate feature constraint.
* The continuation ownership check in `desktop/src/actions/action/action_agent_executor.js:52`, which stays correct once origins are derived consistently.

Tests to extend: `app/src/services/data/data_service.service.test.ts` (which already covers the `project`, `card` and `merge-conflict` routes), `app/src/components/actions/conversation/action_conversation_store.node.test.ts`, and the desktop suites `desktop/src/actions/action/action_runner_service.test.mjs` and the history tests covering `action_files.js`.

## Acceptance criteria

1. Opening the action popup in diagram view, at root level and after drilling into a child node, shows no error dialog. Specifically, `Missing cardInternalId for diagram agent conversation context` is gone, and the string no longer exists in the source.
2. The conversation picker in a diagram popup lists the previous conversations of the selected diagram action, newest first, and selecting one loads its transcript without `Selected agent conversation belongs to another context`.
3. Running a diagram action end to end writes its conversation to `activity/project.json` with `cardInternalId: null`, and that conversation appears in the picker on the next popup open.
4. Continuing an existing diagram conversation from the picker works and appends to the same conversation record.
5. Opening the action popup on a folder node produces no error dialog and lists project-origin conversations for the selected action.
6. Opening the action popup on a plain markdown file that is not a card produces no error dialog, and its run history loads instead of failing with `Card action history requires cardInternalId`.
7. Card popups are unchanged: a card context still lists only that card's conversations, still writes to `activity/card__<internalId>.json`, and a conversation belonging to another card is still rejected on selection.
8. Project and merge-conflict popups are unchanged.
9. `npm run typecheck` passes and the full test suite passes, including new cases for the diagram, folder and non-card-file routes through `listAgentConversations` and `belongsToContext`.
