---
author: 
id: F_189
internalId: 3a0d1119-4bc6-4bba-b47d-ddfabe12d56d
title: add support to view all agent instructions
status: ready
owner: 
affects:
agents:
  - design/activity/card__3a0d1119-4bc6-4bba-b47d-ddfabe12d56d.json
policy:
branch: f_189_add_support_to_view_all_agent_instructions
worktree: 2
changedFiles:
  - app/src/components/editor/instruction_markdown_data_source.node.test.ts
  - app/src/components/editor/instruction_markdown_data_source.ts
  - app/src/components/editor/markdown_data_source.ts
  - app/src/components/hooks/use_active_document.ts
  - app/src/components/hooks/use_agent_instructions.ts
  - app/src/components/project_workspace.tsx
  - app/src/components/text_view/agent_instruction_file_tree.test.tsx
  - app/src/components/text_view/file_tree_node_row.tsx
  - app/src/components/text_view/file_tree_toolbar.tsx
  - app/src/components/text_view/file_tree_view.grouped.test.tsx
  - app/src/components/text_view/file_tree_view.tsx
  - app/src/components/text_view/instruction_editor.test.tsx
  - app/src/components/text_view/instruction_editor.tsx
  - app/src/components/text_view/tab_bar.tsx
  - app/src/components/text_view/text_editor_pane.tsx
  - app/src/components/text_view/text_view.grouped.test.tsx
  - app/src/data/file_tree.node.test.ts
  - app/src/data/file_tree.ts
  - app/src/services/agent_instructions/agent_instruction_file.ts
  - app/src/services/agent_instructions/agent_instruction_paths.node.test.ts
  - app/src/services/agent_instructions/agent_instruction_paths.ts
  - app/src/services/agent_instructions/agent_instructions_service.node.test.ts
  - app/src/services/agent_instructions/agent_instructions_service.ts
  - app/src/services/application_startup_service.ts
  - app/src/services/data/data_service.ts
  - app/src/services/managed_open_document.ts
  - app/src/services/open_document.ts
  - app/src/services/open_files_service.node.test.ts
  - app/src/services/open_files_service.ts
  - app/src/services/project/agent_instruction_project_loading.test.ts
  - app/src/services/project/project_loading.ts
  - app/src/services/project/project_persistence_service.node.test.ts
  - app/src/services/project/project_persistence_service.ts
  - app/src/services/test_support/data_service_test_support.ts
  - desktop/src/project/project_files.js
  - desktop/src/project/project_files.test.mjs
---
when loading the project, we should also search for markdown files that contain agent instructions:

* root readme.md and variations like readme.txt, ...
* if there are sub projects, those readme.md files as well. Make certain not from a folder in gitignore
* all agents.md, every folder that contains this file can be presumed to be a project, so if that folder also contains a readme.md, that can also be loaded
* copilot instructions
* claude specific files
* any other?

These should be placed in a special folder like ´active´ or ´releases´

For name, just show full path as string, so dont put these files in sub folders, they are all in the same special folder, called ´agent instructions´

## Current state

Project loading first reads Markdown files from the working-folder root, then loads all Markdown files below the configured project folder and the repository file index in the background. Desktop `listWorkingTreeFiles` returns tracked files plus nonignored untracked files; GitHub mode returns committed files. Files outside the project folder appear only as paths in that index and cannot be opened.

`ProjectState` parses loaded Markdown into cards or regular Markdown documents. `OpenFilesService` and `TextEditorPane` can open only cards and actions. `README.txt` is therefore unsupported, and instruction files outside the project folder have no document content in renderer state. File tree has configured special folders, but each represents a real repository folder; no flat virtual folder exists.

Both storage implementations already provide `loadTextFile`. Existing commit batching can persist repository files, but open-document types, Markdown editor binding, dirty-state flushing, and watcher routing handle only cards and actions.

## implementation details

* Define an **agent instruction file** as a Git-visible text file matching, case-insensitively, one of these rules: root `README.md` or `README.txt`; any `AGENTS.md`; `README.md` or `README.txt` directly beside an `AGENTS.md`; `.github/copilot-instructions.md`; `.github/instructions/**/*.instructions.md`; any `CLAUDE.md`; or `.claude/rules/**/*.md`. A path matching several rules produces one entry. Preserve its repository-relative path and original casing. “Git-visible” means tracked files plus nonignored untracked files in desktop mode, and committed files in GitHub mode; a tracked file remains visible even when a later ignore pattern matches it.
* Add an `AgentInstructionFile` model containing `path` and `content`, plus an `AgentInstructionsService` that owns loaded files, project/load identity, loading errors, content updates, and granular `EventTarget` events. Paths are persistence and navigation locations, not card identities. Clear service state when project or branch changes, and reject results from stale asynchronous loads.
* During project loading, derive instruction paths from repository index, load their contents through `StorageService.loadTextFile`, and publish entries sorted by path. Filter those paths from Markdown files passed to `ProjectState`; instruction files must never become cards, receive `internalId`, or appear twice in normal folder tree. Apply same filename filtering to initial working-folder files before `ensureCardInternalIds`, so an instruction in working-folder root is never briefly treated as active card.
* Load files independently. One unreadable file reports one warning through `dialogService`, remains absent, and does not prevent project or other instruction files from loading. Missing `loadTextFile` support fails instruction loading with clear storage-capability error.
* Extend open-document model with `instruction` kind backed by `AgentInstructionFile`. Use repository-relative path as document identity because instruction file has no separate domain identity. Update `ManagedOpenDocument`, `OpenFilesService`, tabs, and reconciliation so instruction documents survive content refresh, close normally, and are removed when project changes or file disappears.
* Add instruction Markdown data source and editor component. Render both `.md` and `.txt` content with existing `MarkdownEditor`; `.txt` changes still save plain UTF-8 text at original path. Do not show card properties, card diff, attachments, or action controls. Existing project read-only mode still disables editing.
* When editor stages content, update `AgentInstructionsService` before notifying subscribers, then queue `{ path, content }` through existing commit batcher with message `Update <path>`. Carry `OpenDocumentSaveReference` so successful persistence clears dirty state. Extend `ProjectPersistenceService.flushPendingChanges` to stage and save dirty instruction documents before draining storage writes; failures keep document dirty and use existing save-error handling.
* Add one top-level virtual tree folder named `agent instructions`. Its direct children are all instruction files; each child label and tab tooltip show full repository-relative path. Do not recreate repository subfolders inside virtual folder. Mark virtual folder structurally read-only: no create, delete, rename, or move actions. Child content remains editable when project itself is writable.
* Route watcher events for already loaded instruction paths to `AgentInstructionsService` before normal Markdown-card routing. Extend desktop watcher to report `.txt` changes. External content changes reload clean documents; if corresponding document has unsaved edits, keep local draft and show existing external-change conflict error. Additions or classification changes become visible on next project load; feature does not add continuous repository-wide rediscovery.
* Add focused tests for path classification, case-insensitive matching, sibling README detection, ignored-path absence, deduplication, stable sorting, stale-load rejection, partial load failure, card exclusion, virtual flat tree, structural read-only behavior, `.md` and `.txt` editing, save acknowledgement, project read-only mode, watcher conflict, project switch, and desktop `.txt` watcher filtering. Update open-document and persistence tests for `instruction` kind.

## acceptance criteria

* Opening project loads every Git-visible file matching defined instruction rules in desktop and GitHub modes.
* Ignored untracked files are excluded. Tracked or committed files remain included according to Git visibility.
* One top-level `agent instructions` folder lists matching files as direct children, sorted by full repository-relative path; no nested display folders or duplicate entries exist.
* Virtual folder offers no create, delete, rename, or move action. In writable project, opening child uses existing Markdown editor and saves content to original file path; `.txt` receives same Markdown editing UI.
* Instruction files never become cards, receive card metadata, or also appear in regular folder tree.
* Root and nested `AGENTS.md`, qualifying README files, Copilot files, `CLAUDE.md`, and Claude rules all follow exact matching rules above. Unrelated README files beside no `AGENTS.md` are excluded unless repository root.
* Full repository-relative path appears as tree label and tab tooltip. Absolute machine path is never exposed.
* Successful save clears dirty state through shared persistence flow. Failed save keeps draft dirty and reports existing save error. Read-only project prevents content changes.
* External change to loaded instruction refreshes clean document. External change never overwrites unsaved local draft. Newly added instruction becomes visible after project reload.
* Failure to read one instruction reports warning but leaves project and other instruction files usable. Switching project or branch cannot publish stale instruction results.
* Existing card, action, project-loading, file-tree, open-document, persistence, and watcher tests still pass with new focused coverage.
