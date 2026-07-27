---
id: F-041
title: web app connect button with prefilled connection dialog
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 2f82a0da-bde0-4e79-8f59-5b0935503747
---

## Goal
When the React app runs in a browser (not inside Electron), the toolbar shows a **Connect** button. Clicking it opens a dialog where the user specifies the server to connect to; previously entered values prefill the form.

## Current state
There is no Connect button in the browser: `app/src/components/shell/remote_control_button.tsx` renders `null` when the Electron bridge is absent. The only way to reach a remote server is the "Remote" source inside the open-project dialog (`app/src/components/shell/project/project_open_dialog.tsx`), whose endpoint/token fields always start empty even though the last-used values are persisted in localStorage by `app/src/data/remote_control_connection.ts` (they are read on reconnect, just never fed back into the form).

## implementation details
- In the browser (no Electron bridge), render a **Connect** toolbar button where the Electron build shows its remote-control button; one component can branch on bridge presence.
- The button opens a connection dialog: endpoint (and token — see F-043 for combined endpoint+token entry via paste/QR) prefilled from the stored `RemoteControlConnectionSettings`. Use a non-throwing read (current `readRemoteControlConnection` throws when unset; add a `tryRead` variant returning null).
- When the page was served by the Electron app itself and carries a token fragment (F-045), the app auto-connects to `ws://<location.host>` and skips this dialog entirely; the Connect button/dialog covers the manual-entry case.
- On confirm, store the settings and establish/verify the connection (a lightweight ping such as `listBranches` or a dedicated `hello` method), then hand over to the existing remote open-project flow. Connection errors follow B-047 messaging.
- Prefill also applies to the "Remote" source fields in the open-project dialog so both entry points behave the same.
- Show connected state on the button (e.g. label "Connected", option to disconnect).

## acceptance criteria
- Browser build shows Connect; Electron build does not show it (it shows Accept, see F-042).
- Opening the dialog after a previous session prefills endpoint and token with the last-used values.
- Successful connect leads into the remote project open flow; failure shows the differentiated errors from B-047.
- Tests cover: button visibility per environment, prefill from storage, empty first-run state, and settings persistence on confirm.

## see also
- `design\feature_descriptions\ready\F_032_remote_control_bridge.md`
- `design\feature_descriptions\ready\F_042_remote_control_accept_ui.md`
- `design\feature_descriptions\ready\F_043_remote_control_lan_discovery.md`
- `design\feature_descriptions\ready\B_047_remote_control_connection_errors.md`
