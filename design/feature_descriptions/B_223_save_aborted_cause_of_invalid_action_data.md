---
author: 
id: B_223
internalId: da891103-b0c2-488f-9454-480c73c061a0
title: save aborted cause of invalid action data
status: ready
owner: 
affects:
agents:
  - design/activity/card__da891103-b0c2-488f-9454-480c73c061a0.json
policy:
changedFiles:
  - app/src/components/actions/editor/action_editor.grouped.test.tsx
  - app/src/components/actions/editor/action_editor_content.tsx
  - app/src/components/actions/editor/list_action_editor.tsx
  - app/src/components/actions/editor/use_action_editor_controller.ts
  - app/src/components/editor/data_sources/card_markdown_data_source.node.test.ts
  - app/src/components/hooks/use_action_file_tree_actions.ts
  - app/src/components/text_view/file_tree_view.tsx
  - app/src/services/actions/action_draft_store.ts
  - app/src/services/actions/action_service.node.test.ts
  - app/src/services/actions/action_service.ts
  - app/src/services/data/data_service.service.test.ts
  - app/src/services/open_files_service.node.test.ts
  - app/src/services/open_files_service.ts
  - app/src/services/project/project_loading.test.ts
---
action x has invalid unsaved data. we should not prevent the saving of an action because of this (most likely type diagram)

## Current state

`ActionDraftStore` validates action edits and queues a write only when validation passes. `flushDrafts()` rejects an invalid dirty draft, so `ProjectPersistenceService.flushPendingChanges()` stops before other pending file commits. `ActionService.saveDefinition()` also validates the complete action graph before serializing JSON. Here, *invalid* means action data fails action validation; it can still be serialized as JSON. The current save path treats those separate conditions as one blocker.

## Implementation details

* In `ActionDraftStore`, queue committed drafts for persistence even when action validation fails. Keep the validation error visible in the editor; it describes whether the action can be used, not whether its JSON can be saved. `flushDrafts()` must await these writes rather than reject solely because a draft is invalid.
* Split `ActionService.saveDefinition()` so draft JSON can be serialized and persisted without first passing action graph validation. Publish a changed runnable action only when validation passes. Track the saved revision and acknowledge the open document after the physical write, including for invalid drafts; retain normal failure and retry behavior for serialization or storage errors.
* Preserve the exact saved JSON across reload. The tolerant loader currently sanitizes missing fields or skips invalid definitions, so the editor must still be able to reopen and repair the saved raw data without silently replacing it with sanitized values. Keep invalid actions unavailable for execution until they validate.

## Acceptance criteria

* Saving an action with missing or invalid action fields writes its current JSON values unchanged. Editor still shows validation error; saved action is not executable until valid.
* With invalid action X and valid action Y dirty, project save persists both JSON files and other pending card or instruction files. Save state becomes clean after physical writes complete.
* Reopening project restores X's exact saved invalid values for editing. Fixing them and saving makes action valid without losing its identity or unrelated data.
* A serialization or storage failure still reports a failed save and leaves affected draft dirty for retry. Tests cover invalid draft save, reload, mixed pending changes, and failure retry. Run affected tests and app lint.