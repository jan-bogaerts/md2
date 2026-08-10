---
author: 
id: F_167
internalId: a75df9b2-d7eb-48df-ba8a-398fac272f15
title: Fix broken activity files.
status: ready
owner: 
affects:
agents:
  - design/releases/0_2_0/card__a75df9b2-d7eb-48df-ba8a-398fac272f15.json#conversation=agent-0baac265-01c1-46fa-b6e8-b3c6b6902ecc
  - design/releases/0_2_0/card__a75df9b2-d7eb-48df-ba8a-398fac272f15.json#conversation=agent-f6ea44a7-121c-42e1-bf4c-703035838b62
  - design/releases/0_2_0/card__a75df9b2-d7eb-48df-ba8a-398fac272f15.json#conversation=agent-402bae27-1709-4c54-80c9-0c79efa44ad5
policy:
branch: f_167_fix_broken_activity_files
---
Currently, when the system loads the activity files and there is a problem, like an old version it cant load, the app shows an error and doesnt fix it. So next time project opens, same error.&#x20;

Better if the app tries to fix things:

* If agent ref in card cant be found, remove ref from card.
* If old version, load as much as possible, revert to defaults otherwise.

If this needs to be done, make certain that saving and commiting the changes is done in 1 batch.

## Current state

- Activity version 4 parsing is strict. `migrateActivityValue` recognizes versions 1–3, but its final strict parse rejects the whole file when one required field, collection entry, permission combination, conversation link, or legacy shape is invalid. Migration therefore does not recover partially valid legacy files.
- Local Electron writes a successfully migrated activity file during read, outside the renderer's Git commit batch. GitHub reads activity files with the strict current-version parser and does not migrate them. Remote control inherits Electron behavior. Repair behavior therefore differs by storage backend.
- `AgentIntegration` loads every card `agents` reference independently. A missing file, malformed activity, missing conversation, or wrong-card conversation becomes a warning, but the unresolved reference remains in card frontmatter. Reopening project repeats same failure.
- `CommitBatcher` can put card Markdown and raw JSON writes in one `StorageService.commit`, but project loading has no activity-repair phase that collects both kinds of change before committing.

## implementation details

- Add one shared activity repair function beside strict parsing. Repair means producing canonical current-version activity from parseable fields while preserving each independently valid item. An independently valid item satisfies its own schema and required links; invalid nested items are dropped at smallest level that leaves their parent meaningful. If parent can no longer satisfy schema, drop parent.
- For old versions, apply known version transformations before tolerant normalization. Default missing or invalid top-level `actionSettings`, `conversations`, and `records` to empty collections. Normalize each action setting, conversation, conversation entry, record, and commit independently; preserve valid items and current defaults, and discard unrecoverable items. Revalidate record-to-conversation links after repair and discard records whose required links do not resolve.
- If JSON or root object cannot be parsed, replace file with empty canonical activity when origin can be derived from recognized `project.json` or `card__<internalId>.json` filename. If origin cannot be established, leave file unchanged and treat its references as unresolved. Do not rewrite a future schema version: future means version greater than current version, whose fields this app cannot safely interpret.
- Run repair after full project cards and repository file index load, before attaching persisted conversations. Group references by activity path and load each distinct file once. Include project activity file when present.
- After repair, retain a card reference only when its path loaded, its conversation exists, and conversation `cardInternalId` equals card `internalId`. Remove reference after any unresolved outcome, including missing file, malformed JSON, unrecoverable activity, missing conversation, or wrong-card conversation.
- Collect every changed activity JSON and every card whose references changed. Mutate agent references through canonical `Card` ownership, schedule raw activity files and card references together, then explicitly flush one `CommitBatcher` batch. Defer automatic flush while collecting repairs so no subset can commit early. One batch means one `StorageService.commit` request and one Git commit containing all repair writes for that project load.
- Remove Electron's read-time migration write. Local Electron, GitHub, and remote-control projects must use same shared repair and normal storage commit path. Normal manual/automatic push behavior remains unchanged.
- If repair commit fails, keep batch pending for retry, report one user-visible error, and do not issue a partial repair commit. Keep successfully repaired in-memory data usable during current project session.
- Add shared repair tests, project-load integration tests, storage-backend contract tests, and regression tests for partial legacy data, malformed current data, malformed JSON, future versions, wrong ownership, missing references, one-batch persistence, commit failure, and clean reopen.

## acceptance criteria

- Given a version 1, 2, or 3 activity containing valid and invalid items, project load produces canonical version 4 data: valid items remain, invalid items are dropped at smallest safe level, and missing collections use current empty defaults.
- Given malformed current-version activity, same tolerant repair rules apply. Given unparseable JSON with origin derivable from recognized filename, file becomes empty canonical current-version activity.
- Given future activity version, file is not rewritten because current app cannot safely interpret its schema.
- After repair, every retained card `agents` reference resolves to existing conversation owned by that card. Every unresolved reference is removed, regardless of failure cause.
- One project load with any number of repaired activity files and cards creates exactly one `StorageService.commit` request containing all changed files. No repair file is written or committed before complete batch is ready.
- When no activity content or card reference changes, project load creates no repair commit.
- When repair commit fails, no partial repair commit exists, pending batch remains retryable, and user sees one clear error.
- After successful repair, reopening project does not repeat repaired migration or missing-reference errors.
- Local Electron, GitHub, and remote-control storage produce same repaired content and reference cleanup.
- Unaffected activity data, card fields, conversation loading, commit history, push mode, and project loading remain unchanged.
