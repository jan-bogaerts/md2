---
id: F-013
title: desktop app
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Build the Electron app that hosts the React app and bridges it to the file system and local Git (via preload.js and a WebSocket server for "remote control"), and that runs the agents, capturing stdin/stdout/stderr into logs linked to cards.

## Current state
Electron already opens the React app in a `BrowserWindow`, loads the configured app URL, and exposes a preload IPC bridge as `window.md2Data`. The local Git path supports opening a `.git` folder, loading markdown files, creating the working folder, switching branches, committing, pushing and watching markdown changes. React detects the Electron bridge and can open a local project through `ProjectWorkspace`.

Remote control is not implemented yet: there is no WebSocket server or toolbar flow to start/stop it. Agent execution is also not implemented yet: there is no process runner, stdin/stdout/stderr capture, log persistence or card-to-log linking.

## implementation details
- Keep the Electron main process responsible for window creation, app menu commands and IPC handlers.
- Keep preload as the only renderer-facing desktop API; expose explicit bridge methods rather than direct Node access.
- Use the existing local Git service for filesystem and Git operations, including root-path validation and project-root escape checks.
- Add a remote-control command in the React toolbar that asks Electron to start/stop a WebSocket server and reports connection state back to the UI.
- Add an agent runner in Electron that starts configured commands, streams stdout/stderr to React, accepts stdin input, and persists logs as json files linked from the active card.
- Reuse data-management storage boundaries: React calls storage/data services, while Electron owns local filesystem, Git and process execution.
- Surface failures from folder selection, Git commands, file watching, WebSocket startup and agent execution as user-visible errors.

## acceptance criteria
- Starting the desktop app opens the React app in Electron using the configured app URL.
- The renderer can open a local `.git` project through `window.md2Data` without direct Node access.
- Local project load, branch checkout, commit, push and markdown file watching work through the Electron bridge.
- The app can start and stop remote-control mode from the UI, and Electron exposes a WebSocket endpoint only while remote control is active.
- Agent commands run from Electron, with stdout/stderr streamed to the UI and stdin forwarded from the UI.
- Agent logs are persisted and referenced from the related card so conversations can be reopened later.
- Desktop bridge, remote-control and agent failures are shown in the UI with clear error messages.

## see also
- `design\architecture\initial description\desktop app.md`
- `design\architecture\initial description\data management.md`
- `design\architecture\initial description\overview.md`
