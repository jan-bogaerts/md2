---
author: 
id: F_108
internalId: 5cdae748-9597-4d29-8dc0-3d4b5df3aa7f
title: add file-search editor plugin
status: in progress
owner: 
affects:
agents:
  - design/activity/card__5cdae748-9597-4d29-8dc0-3d4b5df3aa7f.json#conversation=agent-b9d63699-a849-4936-a09d-11ca31f0a753
policy:
after: 0f5a1edf-4b4e-4dea-8c7a-05df83ae1288
worktree: 1
---
The markdown editor currently already has support for the `placeholder plugin (place holder type ahead pluging)` which shows an overlay container when the user enters '{{'

We should add similar support for '@' which should show a popup that shows a list of filenames in the project. As the user types characters after the @, the search list should be further refined.

if the user clicks on a filename or presses enter, the filename should be selected and inserted in the markdown editor as a file link.

I believe there is already some work done for this, like getting all the filenames in the project. please check code base for stuff we can re-use

## Current state

`MarkdownEditor` already installs a Lexical typeahead plugin for `{{` placeholders. It owns trigger matching, filtering, keyboard/mouse selection, MUI popup rendering and text replacement. No `@` file-search plugin exists.

Project loading already stores every repository-relative file path in `ProjectSnapshot.repositoryFiles` for local Git, GitHub and remote-control storage. `useProjectState` exposes this list to React components; no new storage or desktop API is needed.

## Implementation details

- Add a separate file-search realm/typeahead plugin beside the placeholder plugin and install it in every `MarkdownEditor`, including toolbarless editors and new-card/action-prompt surfaces.
- Read options from current `ProjectSnapshot.repositoryFiles` and update them when project state changes. With no open project or no files, `@` remains normal text and no popup opens.
- Trigger on `@`, filter repository-relative paths case-insensitively as characters are typed, and show enough path context to distinguish duplicate filenames.
- Mouse selection or Enter replaces the trigger/query with `[filename](repository-relative/path)`. Keep destination repository-relative; do not rewrite it relative to current document.
- Keep placeholder behavior unchanged. Use separate trigger, option and popup components so file-search logic does not alter placeholder types or formatting.
- Tests cover trigger boundaries, filtering, duplicate names, keyboard/mouse selection, link insertion, empty project state and coexistence with `{{` placeholders across editor presentations.

## Acceptance criteria

- Typing `@` in any editable Markdown editor opens a project-file popup when repository files exist.
- Further typing filters paths case-insensitively; duplicate filenames remain distinguishable.
- Clicking a result or pressing Enter inserts `[filename](repository-relative/path)` at the query location.
- Arrow-key navigation, dismissal and mouse selection work without losing editor focus.
- Empty/unloaded projects leave typed `@` text unchanged and show no empty popup.
- Existing placeholder typeahead, Markdown editing and persistence behavior remain unchanged.
