---
id: F-015
title: remarkable integration
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Auto-import images from a Remarkable device over SSH: list and select files, track last import dates, place images next to the card-file (new or existing feature), commit to GitHub, and offer an agent command to convert images to text.

## implementation details
- Implement Remarkable import as an Electron/local Git capability. React calls explicit preload bridge methods; Electron owns SSH, filesystem writes and Git commands.
- Add Electron handlers to configure/test SSH connection details, list image files on the device with modified times, import selected files and persist per-device import metadata in the project.
- Store import metadata in a project-local json file under the working folder so the UI can mark files as new, changed or already imported.
- Extend the local Git write path to support binary asset files in addition to markdown text files. Keep root-path validation so imported files cannot escape the project.
- Add a React import panel for connection status, remote file selection, import target selection and changed-since-last-import indicators.
- Import targets are either an existing active card or a newly created feature card. Imported images are written beside the target card and referenced from the markdown with relative links.
- Commit the card markdown, imported image files and import metadata together; auto/manual push behavior follows the existing project push mode.
- Expose a card action for "convert Remarkable images to text" only when agent execution is available; the action passes selected image paths to the agent and links the output to the card.
- Surface SSH connection failures, missing project/card state, unsupported file types, duplicate target filenames, Git commit/push failures and agent-start failures as user-visible errors.
- Tests cover bridge validation, import metadata diffing, asset path placement, markdown link insertion, local Git binary writes and the import panel target flow.

## acceptance criteria
- In Electron local-project mode, the user can configure/test a Remarkable SSH connection and list available image files with modified times.
- The UI distinguishes never-imported, changed-since-import and unchanged files from persisted project metadata.
- Selected images can be imported into an existing active card or into a new feature card.
- Imported image files are stored in the same folder as the target card and referenced from that card with relative markdown links.
- Import commits include the card markdown, image assets and import metadata; auto-push and manual-push modes behave like normal card edits.
- Invalid SSH settings, failed transfers, duplicate filenames, unsupported files and Git failures show clear errors without partially updating app state.
- When agent execution is available, a card action can start image-to-text conversion for imported Remarkable images and link the agent output to the card.

## see also
- `design\architecture\initial description\remarkable.md`
