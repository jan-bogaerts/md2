---
id: F-013
title: desktop app
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 591f1445-932b-45c9-b161-a01fe484e9ca
---

## Goal
Build the Electron app that hosts React, bridges it to the file system and local Git, and owns the action runner for command and agent actions, including chaining, process control, streaming, stdin, cancellation, and card-linked logs.

## Current state
Electron already opens the React app in a `BrowserWindow`, loads the configured app URL, disables context isolation, and exposes a preload bridge as `window.md2Data`. The local Git path supports opening a `.git` folder, loading markdown files, creating the working folder, switching branches, committing, pushing and watching markdown changes. React detects the Electron bridge and can open a local project through `ProjectWorkspace`.

Remote control is not implemented yet: there is no WebSocket server or toolbar flow to start/stop it. Agent execution is also not implemented yet: there is no process runner, stdin/stdout/stderr capture, log persistence or card-to-log linking.

## implementation details
- Keep the Electron main process responsible for window creation, native dialogs and app menu commands.
- Keep preload as the only React-facing desktop API; expose explicit bridge methods and run local desktop capabilities there when Electron main ownership is not required.
- Use the existing local Git service for filesystem and Git operations, including root-path validation and project-root escape checks.
- Add a remote-control command in the React toolbar that asks Electron to start/stop a WebSocket server and reports connection state back to the UI.
- Add one Electron action runner that loads persisted definitions by action `id`, executes `onBefore`/main/`on`/`onAfter`, and delegates agent process lifecycle to the Electron agent runner.
- The action bridge accepts action id, context, and run-specific input only. It does not accept executable definition data from React.
- Start command and agent processes in Electron, stream stdout/stderr to React, accept live agent stdin, support cancellation by execution id, and persist agent logs as JSON linked from the active card.
- Reuse data-management storage boundaries: React calls storage/data services, while preload owns local filesystem, Git and process execution unless a capability requires the main process.
- Surface failures from folder selection, Git commands, file watching, WebSocket startup and agent execution as user-visible errors.

## acceptance criteria
- Starting the desktop app opens the React app in Electron using the configured app URL.
- The renderer can open a local `.git` project through `window.md2Data`.
- Local project load, branch checkout, commit, push and markdown file watching work through the Electron bridge.
- The app can start and stop remote-control mode from the UI, and Electron exposes a WebSocket endpoint only while remote control is active.
- Manual, state-triggered, and scheduled actions resolve by id and run through the same Electron action runner.
- Command and agent processes run from Electron, with stdout/stderr streamed to the UI, live agent stdin forwarded, and cancellation supported.
- Agent logs are persisted and referenced from the related card so conversations can be reopened later.
- Desktop bridge, remote-control and agent failures are shown in the UI with clear error messages.

## see also
- `design\architecture\initial description\desktop app.md`
- `design\architecture\initial description\data management.md`
- `design\architecture\initial description\overview.md`
