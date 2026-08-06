---
author: 
id: B_92
internalId: c9e7dccb-d263-4ba6-98fc-b4361a01bf4d
title: click on link to code not working
status: ready
owner: 
affects:
agents:
  - design/activity/card__c9e7dccb-d263-4ba6-98fc-b4361a01bf4d.json#conversation=agent-98813ed6-0907-475d-a831-9e4c10492ddb
  - design/activity/card__c9e7dccb-d263-4ba6-98fc-b4361a01bf4d.json#conversation=agent-aae77199-0ad2-4afd-adf3-c5c9dfbf4284
policy:
branch: b_92_click_on_link_to_code_not_working
worktree: 1
---

error:

Local file link target does not exist: vidsy\_ai\_electron/src/services/analysis/frame\_rules/\_*\_tests*\_\_/frame\_rules\_service.test.js:12



the agent will return the files local to it's working folder, so that's where we should search for the files to open

also, these files should be opened by an external app. currently just start vscode, but this should be a config parameter for the application (not project specific, but global to the app)

## Current state

Chat links are resolved against active project root and `snapshot.repositoryFiles`. Card agents can instead run in card's assigned linked worktree. Linked-worktree files and links ending in a line suffix such as `frame_rules_service.test.js:12` therefore fail lookup.

`openInEditor` is shared by chat code links and diff-line clicks. Desktop implementation ignores request `repositoryRoot` and always resolves from primary project root, then launches hard-coded `code -g`. Agent conversations retain stable card identity, while current card and worktree state provide folder needed when link is clicked.

## Implementation details

- Resolve local chat links when clicked from current conversation context. For card conversation, find card by stable `cardInternalId`; if card currently has valid assigned worktree, use that worktree folder. Otherwise use active primary repository folder. Project conversations use primary repository folder.
- Parse optional trailing `:<line>` separately from file path, resolve relative paths from selected folder, and keep absolute paths absolute. Worktree reassignment or unassignment must affect existing conversation links immediately; do not persist folder on messages.
- Resolve and validate target in desktop host, where filesystem is available. Require existing regular file and allow only files inside active primary repository or registered linked worktree. Do not use primary snapshot file index to validate external code files.
- Keep existing internal routing for project Markdown and loaded action JSON files. Open other local files through shared `openInEditor` bridge at parsed line, defaulting to line 1. Keep web-link behavior unchanged.
- Add global desktop config `editorCommand`. Treat it as command template with required `{{file}}` and optional `{{line}}` placeholders. Default: `code -g "{{file}}:{{line}}"`.
- Make shared desktop launcher substitute validated absolute file path and line into `editorCommand`, with selected card worktree, primary repository, or diff `repositoryRoot` as process `cwd`. Diff clicks keep current behavior but use same configurable command.
- Report missing files, invalid line suffixes, paths outside allowed repositories/worktrees, invalid templates, and launch failures through `dialogService`; leave renderer usable.

## Acceptance criteria

- Clicking `relative/path.js:12` in card agent output resolves from card's current assigned worktree, or primary repository when unassigned, and opens exact file at line 12.
- Reassigning or unassigning card changes folder used by existing conversation links without changing persisted conversation.
- Relative links open files that exist only in assigned linked worktree; primary-project copy is not substituted.
- Absolute local-file links resolve to same file, while missing files and paths outside active primary repository or registered worktrees are rejected.
- Project Markdown and loaded action JSON links still open in internal editor. Other local files open in configured external app. Web links keep normal behavior.
- Desktop config shows global editor command, persists it outside project config, and defaults to `code -g "{{file}}:{{line}}"`.
- Changing editor command affects both chat code links and diff-line clicks. Each supplies correct file, line, and execution directory.
- Tests cover click-time card assignment lookup, reassignment and unassignment, project-conversation fallback, `path:line` parsing, primary/worktree resolution, containment and existence checks, internal routing, default and custom command substitution, shared diff behavior, and error reporting.
