---
id: B-047
title: remote control connection failures are generic and can hang without timeout
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 9e4ba175-ca0e-4bab-aa86-5786eee4392f
---

## Problem
Every remote-control connection failure in `app/src/services/remote_control_storage_service.ts` surfaces as the same `'Remote-control connection failed'` error: unreachable server, refused socket, invalid token (server responds 401 on upgrade), and occupied server all look identical to the user. In addition, `ensureConnected` has no timeout — a server that accepts TCP but never completes the WebSocket handshake leaves the promise pending and the UI stuck in its loading state indefinitely. Finally, `loadRemoteBranches` in `app/src/components/shell/project/use_project_toolbar_menu_actions.ts` swallows the branch-list failure in its catch block; verify the session service's error state actually reaches the user in the open-project dialog.

## Fix
- Add a connect timeout (e.g. 10 s) to `ensureConnected`: if neither `open` nor `error`/`close` fires in time, close the socket and reject with "The remote-control server did not respond."
- Differentiate failure messages where the browser API allows:
  - handshake `close` with the occupied code (see B-046): "server is occupied";
  - `error`/`close` before open without a known code: "could not reach the remote-control server — check the endpoint and that Accept is active" (browsers do not expose whether it was a 401, connection refused, or DNS failure, so this remains the catch-all; mention the token as a possible cause in the message);
  - timeout: dedicated message as above.
- Ensure these errors reach the user in both entry points: the open-project flow (`withLoading` error state must be rendered in the dialog) and mid-session request failures (dialogService error).

## acceptance criteria
- Connecting to a non-listening endpoint shows the unreachable message within the timeout window; the UI leaves its loading state.
- Connecting to a host that accepts TCP but never answers the handshake fails after the timeout with the no-response message.
- The occupied case shows its own message (covered with B-046).
- A failed "Load remote branches" visibly reports the error in the dialog.
- Tests cover timeout rejection, close-code mapping, and error propagation to the UI layer.

## see also
- `design\feature_descriptions\ready\F_032_remote_control_bridge.md`
- `design\feature_descriptions\ready\B_046_remote_control_single_connection.md`
