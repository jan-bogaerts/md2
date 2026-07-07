---
id: F-002
title: data management
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Implement the two-layer data service (generic data service + storage services for GitHub web API and local Git via Electron) covering project create/open, branch switching, card creation, naming conventions, auto-save with delayed commits, and auto/manual push.

## Current state
Only the design notes exist. There is no React app, Electron bridge, data service, storage service, project loader, GitHub persistence, local Git persistence or file watcher implemented yet.

## implementation details
- Add a generic data service API for project, branch, file and card operations. Keep storage-specific behavior behind storage service implementations.
- Implement a GitHub storage service using the GitHub web API for repository/branch selection, file reads/writes, commits and pushes.
- Implement a local Git storage service exposed by Electron for opening a local `.git` folder, reading/writing files, running Git commands and watching file changes.
- Project create/open loads the configured working folder, defaults to `design`, asks for another folder if missing, and can create template content when no folder exists.
- Card creation writes a markdown file in the working folder using `{id}-{title}.md`; ids are configurable per card type and default to `F-{number}`, `J-{number}`, `B-{number}` using the next available number across the folder and subfolders.
- Project load reads root markdown headers first for active cards, then reads subfolder headers in the background for search/history data. Header parsing and active/background splitting go through the shared parsing service.
- Auto-save file edits, but batch commits so normal typing commits at most every 30 seconds; force a final commit on close.
- Support auto-push and manual-push modes. Manual mode exposes a push command in the menu.
- Auto-load the last project on app start and allow branch switching from the menu.
- When external markdown files are discovered, import files that do not follow naming conventions as new features; headers are optional.

## acceptance criteria
- A project can be created or opened from GitHub by selecting repository and branch, and from Electron by selecting a local `.git` folder.
- The configured working folder is loaded from the project; missing folders trigger folder selection or template-based creation.
- Branch switching reloads project content from the selected branch.
- New cards are created, committed and named with the configured id and `{id}-{title}.md` convention.
- Root markdown headers populate active cards before background subfolder header loading begins.
- Auto-save persists edits, delayed commits are limited to roughly every 30 seconds during editing, and closing forces any pending commit.
- Auto-push pushes committed changes automatically; manual-push mode leaves commits unpushed until the user runs the push command.
- External file additions, removals and changes are reflected in the app when using the Electron local Git service.

## see also
- `design\architecture\initial description\data management.md`
- `design\architecture\initial description\overview.md`
- `design\architecture\initial description\desktop app.md`
- `design\architecture\parsing_service.md`
