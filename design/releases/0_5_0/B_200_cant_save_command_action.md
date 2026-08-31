---
author: 
id: B_200
internalId: 49c227f7-c9c7-4773-a246-b4ec451244f1
title: cant save command action
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__49c227f7-c9c7-4773-a246-b4ec451244f1.json
policy:
after: 22fa2af9-9b97-47c2-931f-ed5a5a62f89d
changedFiles:
  - app/src/components/actions/editor/action_definition_fields.test.tsx
  - app/src/components/actions/editor/action_definition_fields.tsx
  - app/src/components/actions/editor/action_editor.real.test.tsx
  - app/src/components/actions/editor/action_editor.test.tsx
  - app/src/components/actions/editor/action_editor_content.tsx
  - app/src/components/actions/editor/use_action_editor_controller.test.ts
  - app/src/components/actions/editor/use_action_editor_controller.ts
  - app/src/components/editor/action_markdown_data_source.node.test.ts
  - app/src/components/editor/action_markdown_data_source.ts
  - app/src/components/hooks/use_actions.test.ts
  - app/src/components/project_workspace.test.tsx
  - app/src/components/text_view/text_view.test.tsx
  - app/src/data/commit_batcher.test.ts
  - app/src/data/commit_batcher.ts
  - app/src/services/actions/action_draft_store.ts
  - app/src/services/actions/action_service.node.test.ts
  - app/src/services/actions/action_service.ts
  - app/src/services/actions/action_service_events.ts
  - app/src/services/actions/action_service_helpers.ts
  - app/src/services/data/card_internal_id_operations.ts
  - app/src/services/data/card_operation_context.ts
  - app/src/services/data/card_operations.ts
  - app/src/services/data/card_rename_operations.ts
  - app/src/services/data/data_service.test.ts
  - app/src/services/data/data_service.ts
  - app/src/services/data/remote_control_storage_service.node.test.ts
  - app/src/services/github/github_storage_write_operations.test.ts
  - app/src/services/github/github_storage_writer.ts
  - app/src/services/open_files_service.node.test.ts
  - app/src/services/open_files_service.ts
  - app/src/services/project/project_loading.test.ts
  - design/architecture/data_saving_and_commits.md
  - design/feature_descriptions/B_201_commit_batcher_domain_identity_and_active_pending_batches.md
  - design/feature_descriptions/B_201_expected_persistence_outcomes_for_watcher_echoes.md
  - desktop/src/project/project_files.js
  - desktop/src/project/project_files.test.mjs
---
Saving a newly created action can leave the application unable to continue. The failure occurs when the action is edited again while its first persistence operation is active, especially when a label change also changes the action filename.

## Current state

`CommitBatcher` stores pending changes in one map keyed by persistence path. Cards carry `cardInternalId`, but the map still uses their path. Actions reach the batcher as generic files, so their stable `id` is lost at that boundary. A label change therefore replaces or creates entries through old and new paths instead of through the identity of the same action.

When a flush starts, the batcher copies the current map values into an array but leaves them in the live map. New edits continue replacing entries in that same map. After persistence succeeds, the batcher compares each copied object with the live entry at its path:

* the same object is removed as committed;
* a different object is treated as a newer edit and retained or re-keyed.

This compare-and-remove mechanism depends on object-reference equality and path reconciliation. A path change during an active creation or rename can leave the newer entry associated with the wrong source path, create two action files with the same action `id`, and cause the watcher reload to report duplicate actions. Once this happens, the user cannot continue saving normally.

Action validation is not action identity. An incomplete command is persistable under `B_199`; validation feedback must not discard the action draft, its pending-save ownership, or its stable identity. Repairing a field must queue the latest definition for the same action.

The timer is separate from this defect. The implementation currently uses one 30-second trailing debounce for the complete batch: every scheduled change resets the global timer. This job does not change that policy. `design/architecture/data_saving_and_commits.md` currently says later changes do not restart the timer and must be corrected when the architecture note is updated.

## Required behavior

* `Card.header.internalId` identifies a pending card change.
* `ActionDefinition.id` identifies a pending action change.
* A generic file without domain identity may use its path as its pending key.
* Card and action paths are mutable persistence metadata, never their pending-change identity.
* An action label change still automatically changes its filename to the label-derived path.
* A label-driven filename change is represented as an explicit path-change operation for the same action `id`.
* Starting persistence transfers the complete pending collection into an isolated active batch and immediately creates a new empty pending collection.
* Changes received during persistence go only into the new pending collection and are committed by a later flush.
* A successful active batch is discarded without reference-equality comparisons against the pending collection.
* If an active path change succeeds while a newer change for the same domain identity is pending, the newer change uses the committed target as its source path.
* If persistence fails, active entries are returned to the pending collection without replacing newer entries for the same domain identity.
* A missing move source is recoverable: storage skips the move and writes the requested target file. Local Git also stages the already-existing source deletion when needed.
* Watcher notifications remain local persistence echoes and must not create duplicate action definitions or conflicts.

## Implementation details

1. Replace the implicit `CommitChange` shape with a discriminated union for `card`, `action`, and generic `file` changes. Give action changes an `actionId`; keep `cardInternalId` on card changes. Derive a collision-safe pending key from kind plus identity.
2. Pass `ActionDefinition.id` from `ActionService` through `DataService.persistActionFile` into `CommitBatcher`. Keep serialized content, source path, target path, callbacks, and save references on the action change as persistence metadata.
3. Key `ActionDraftStore` state by action `id`. Store the current source path and desired label-derived target path in the draft. Update editor and open-document integrations to address the draft by action `id`; paths remain necessary for loading, navigation, watcher events, and storage requests.
4. Keep automatic label-derived filenames. A valid label edit updates the draft target path and replaces the pending action change under the same action key.
5. Replace the live-map snapshot/reference-comparison workflow with separate `pendingChanges` and `activeBatch` collections. Swap the collections synchronously when a flush begins. Do not mutate `activeBatch` after the swap.
6. On active-batch success, acknowledge its captured revisions and path changes. Rebase only the source-path metadata of a newer pending entry for the same identity onto the path that was actually committed.
7. On active-batch failure, merge its entries back only where the pending collection has no newer entry for that identity. Preserve the failure for reporting and retry through the existing persistence-state flow.
8. Remove `sourceExists` and `moveSource` as scheduling decisions. Produce an ordinary write when source and target paths match and a move when they differ. The storage backend decides how to handle an absent move source.
9. In local storage, check whether the move source exists. If it does, move it and write the latest content. If it does not, write the target directly and stage the already-existing source deletion. Apply equivalent missing-source behavior to the GitHub and remote-control storage paths.
10. Update `design/architecture/data_saving_and_commits.md` to describe domain-keyed changes, isolated active and pending batches, label-driven action moves, missing-source behavior, and the unchanged global trailing-debounce timer.

## Acceptance criteria

* Pending card changes are keyed by `cardInternalId`; pending action changes are keyed by action `id`.
* Editing an action label automatically persists the definition at the corresponding label-derived filename and removes the previous filename when it exists.
* An action draft remains the same draft, with the same action `id`, while its label and source path change.
* A newly created action can become incomplete, be repaired, and have its label changed while its initial persistence is active; the final result contains exactly one action file with the latest content and label-derived path.
* Repeated label edits during an active rename produce sequential moves from the path actually committed to the latest requested path.
* New edits received during persistence are stored only in the pending collection and are not removed when the active batch succeeds.
* A failed active batch returns its changes for retry without overwriting newer pending changes for the same card, action, or generic file.
* A move whose source file is already absent writes the target successfully and does not fail because the source cannot be deleted or moved.
* Watcher reload after each scenario loads one definition per action `id` and does not leave the editor or project save flow blocked.
* Existing explicit flush, retry, save-reference acknowledgement, commit-message aggregation, and automatic-push behavior remains intact.
* Focused tests cover action creation, incomplete-to-complete repair, label changes, edits during active writes and moves, active-batch failure merging, missing move sources, watcher reload, and card/action/generic-file key separation.

## Out of scope

* Changing the 30-second delay.
* Replacing the global trailing debounce with fixed-window or per-file settling behavior.
* Stopping automatic action filename changes when labels change.