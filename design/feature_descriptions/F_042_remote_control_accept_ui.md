---
id: F-042
title: electron accept button and connection status display
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Inside Electron the remote-control toolbar button reads **Accept** (tooltip: "accept external connection for web control"). After clicking, the app shows an **accepting** state in the status bar; once an external client connects, the status becomes **connected**.

## Current state
`app/src/components/shell/remote_control_button.tsx` labels the button "Remote off" / "Remote on" / "Remote N" and puts the endpoint **and the token** in the tooltip. There is no accepting/connected wording and no status-bar display. The underlying data already exists: `RemoteControlStatus` carries `active`, `clientCount`, `endpoint`, `token`, and the bridge pushes updates via `onStatusChange`.

## implementation details
- Relabel the toolbar button to **Accept** when the server is inactive, with tooltip "accept external connection for web control". While active, the button toggles the server off (label e.g. "Stop accepting").
- Status display: `active && clientCount === 0` shows "accepting", `clientCount > 0` shows "connected". Render this in the status bar; if the app has no status-bar component yet, add a minimal one (right-aligned strip in the shell) rather than overloading the button label.
- Stop exposing the token in a hover tooltip; the endpoint/token/QR presentation moves to the connection-info UI from F-043.
- Status transitions come from the existing `onStatusChange` subscription; with the max-1 policy (B-046) `clientCount` is 0 or 1.

## acceptance criteria
- Electron build: button shows "Accept" with the specified tooltip when idle; clicking starts the server and the status bar shows "accepting".
- When a web client connects, status changes to "connected"; when it disconnects, back to "accepting".
- Stopping the server clears the status display.
- The token no longer appears in the button tooltip.
- Tests cover label/tooltip per state and status-bar transitions driven by status-change events.

## see also
- `design\feature_descriptions\ready\F_032_remote_control_bridge.md`
- `design\feature_descriptions\ready\B_046_remote_control_single_connection.md`
- `design\feature_descriptions\ready\F_043_remote_control_lan_discovery.md`
