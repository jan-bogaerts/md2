---
author: JB
id: F_148
internalId: 93e5e061-24e8-4586-ad31-4bb39b237489
title: Simplify card state ownership
status: ready
owner:
affects:
  - app/src/data/data_types.ts
  - app/src/services/project/project_state.ts
  - app/src/services/data/card_operation_context.ts
  - app/src/services/data/card_operations.ts
  - app/src/services/data/data_service.ts
  - app/src/services/data/markdown_parsing_service.ts
  - app/src/services/open_files_service.ts
  - app/src/services/managed_open_document.ts
  - app/src/components/card_view/use_project_card.ts
  - app/src/components/editor/card_markdown_data_source.ts
agents:
policy:
---

## Problem

The card state introduced by F_143 is over-engineered and has unclear ownership. `CanonicalCard`, `ProjectCard`, project snapshots, and open editor documents can all carry complete card objects. React-facing snapshots are also accepted as writable domain objects.

This causes stale data to overwrite newer fields. The failure is confirmed in Git history: one save assigned `worktree: 3`, and the next unrelated ordering save removed it. Agent references, policy values, status, ordering, and body content are exposed to the same risk.

The current `useProjectCard` signature also serializes large card data, including conversations, to detect small changes. This creates unnecessary allocations and can rerender unrelated card UI.

## Required design

Use one domain type named `Card`. Remove the `CanonicalCard` versus `ProjectCard` distinction.

`ProjectState` owns the loaded cards. A card may only be changed through focused data-service operations such as changing its body, title, worktree, policy, status, or ordering. React snapshots and editor drafts are read values and must never be passed back as replacement cards.

Do not copy a complete card to change one field. Do not use `Object.assign` or an equivalent whole-object merge to apply an editor change. The body editor changes only the body. Metadata operations change only their named fields.

Parser bookkeeping needed to preserve unknown Markdown fields and formatting may remain private persistence metadata. It must not be represented as another card type or exposed as editable UI state.

## React subscriptions

Subscribe at the smallest component that renders a value. `useSyncExternalStore` snapshots should return a primitive or stable reference derived from service data, for example:

- the worktree indicator reads only the worktree value and error;
- the title control reads only the title;
- policy controls read only the relevant policy value;
- the body editor reads only the body and save state;
- conversation components read conversation data independently;
- columns read stable ordered card IDs, not complete cards.

Changing one field must not recreate a complete card, stringify conversations, or rerender components that do not consume that field. Use granular `EventTarget` events; do not add revision counters or a custom listener registry.

## Persistence and external changes

Serialize the current `Card` at the persistence boundary. Batched saves must retain every newer field even when another field changes while a commit is pending.

Watcher updates must be parsed and applied deliberately. Ignore the app's own commit echoes as today. If an external update conflicts with a dirty local field, report the conflict and preserve the local change. Do not replace a complete card merely because one external field changed.

Activity JSON remains separate from card state. Linking an activity conversation changes only the card's activity references and must not affect worktree, ordering, body, or other metadata.

## Compatibility and failure handling

- Preserve existing Markdown format, unknown frontmatter, commit batching, save acknowledgement, push modes, rename behavior, and worktree execution.
- Preserve open-editor undo/redo and dirty state.
- Missing cards or required identities must fail with a clear error.
- Do not add legacy card shapes, compatibility modes, or fallback state copies.

## Acceptance criteria

- There is one domain `Card` type and one owning service path for card mutations.
- React snapshots and editor drafts cannot replace or merge a complete card.
- A field change persists without modifying unrelated fields.
- A field change rerenders only consumers of that field or a deliberately small projection.
- Card subscriptions do not stringify the body, conversations, activity history, or complete card.
- Assigning a worktree, then editing the body, changing ordering, linking an agent conversation, or receiving an activity update never removes the worktree.
- A streaming agent remains attached to the assigned worktree across responses and follow-up prompts.
- Existing card, persistence, watcher, worktree, activity, and editor behavior remains unchanged outside this simplification.

## Tests

Add regression coverage for:

1. Open and dirty a card, assign a worktree, change ordering, flush, and verify the worktree and body remain persisted.
2. Link an agent conversation while worktree and policy values are set, then verify all unrelated fields remain unchanged.
3. Change each subscribed field and verify unrelated leaf components do not rerender.
4. Apply an external watcher update while a local field is dirty and verify the conflict policy preserves local state.
5. Change a card during an in-flight commit and verify the second commit contains the combined latest state.
6. Continue a streaming worktree agent after its first response and verify the same live session and worktree are used.
