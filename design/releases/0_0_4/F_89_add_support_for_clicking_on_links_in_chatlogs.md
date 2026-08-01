---
author: 
id: F_89
internalId: 9ef42f8e-d6f7-4514-8e4a-5555318c4b51
title: add support for clicking on links in chatlogs
status: ready
owner: 
affects:
agents:
policy:
after: e69b9faf-30dd-4ad6-9d99-7e6af4d18c76
---
Sometimes the agent produces a link to a local project file. Currently, when the user clicks on this link, the system crashes.

What should happen: if it is a md file or action-json file in the design folder (or subfolder), show it in the list view with the correct editor. Otherwise, open it with vscode (externally)

## Current state

`ActionConversationChat` renders messages with `ReactMarkdown` without a custom link handler. Local paths therefore use browser navigation and can crash the Electron renderer.

The app already opens loaded Markdown and action-definition JSON files through `workspaceNavigationService` and `openFilesService`. VS Code opening exists through the Electron `openInEditor` bridge, but is currently used only for diff lines.

## Implementation details

- Intercept local-file links in `ActionConversationChat`; prevent browser navigation and report failures through `dialogService`.
- Accept repository-relative paths and absolute Windows paths. Normalize separators and convert paths inside the active repository to repository-relative paths.
- When the target is inside configured `projectFolder` and is either a Markdown file or a loaded action-definition JSON file, switch to list view and open its existing Markdown or action editor.
- Open every other local project file in VS Code through the Electron bridge. Keep normal web-link behavior unchanged.
- Reject paths outside the active repository and missing targets without crashing.

## Acceptance criteria

- Clicking relative or absolute Windows links to Markdown files under configured `projectFolder` opens them in list view with the Markdown editor.
- Clicking relative or absolute Windows links to action-definition JSON files under configured `projectFolder` opens them in list view with the action editor.
- Clicking another local project-file link opens that file in VS Code.
- Invalid, missing, or out-of-project file links show an error and leave app usable.
- Tests cover path normalization, internal editor routing, VS Code fallback, and error handling.
