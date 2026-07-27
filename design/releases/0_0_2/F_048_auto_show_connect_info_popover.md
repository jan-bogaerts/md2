---
id: F-048
title: auto-open connection-info popover on accept, with a toggle button and "Disconnect" relabel
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 6eb7a40a-1331-4c18-bbd9-b48bfd0af22c
---

## Goal
When the user starts accepting remote connections (Electron **Accept** button), the connection-info popover — hostname/IP endpoints, copy-link button and QR code — should open **automatically** so the QR is immediately visible without a second click. The primary button is renamed to **Disconnect** while active, and a small **down-arrow** button sits next to it that toggles the popover open/closed.

## Current state
`app/src/components/shell/remote_control_button.tsx`:
- While active, the toggle button is labelled **"Stop accepting"**.
- A separate **"Connect info"** text button appears next to it; clicking it sets `isInfoOpen` and opens `RemoteControlConnectionInfo` (`app/src/components/shell/remote_control_connection_info.tsx`), the popover that renders the endpoints, copy button and QR code (`isInfoOpen` starts `false`).
- Nothing opens the popover automatically after `bridge.start()` succeeds, so a user who expects the QR to appear on Accept sees only the firewall prompt and a relabelled button — the QR is one easy-to-miss click away.

The popover content itself already works (hostname, IP fallbacks, copy connect-link, QR of the connect URL) and is unchanged by this feature.

## implementation details
- After `bridge.start()` succeeds in `handleClick`, set `isInfoOpen` to `true` so the popover opens automatically. When stopping, ensure `isInfoOpen` is `false`.
- Rename the active-state toggle button label from **"Stop accepting"** to **"Disconnect"**. Keep the idle label **"Accept"**. The active tooltip should match (e.g. "stop accepting external connections" / "disconnect").
- Replace the **"Connect info"** text button with a small **down-arrow icon button** next to Disconnect that toggles the popover (`setIsInfoOpen((open) => !open)`). It uses the same `buttonRef`/anchor so the popover stays anchored to the control group. Give it an accessible label/tooltip (e.g. "show connect link and QR code").
- The popover remains dismissible via its existing `onClose` (backdrop click / escape), which sets `isInfoOpen` to `false`; the arrow button then re-opens it.
- No change to `RemoteControlConnectionInfo`, the bridge, or the desktop service is required.

## acceptance criteria
- Clicking **Accept** starts the server and the connection-info popover opens automatically, showing the QR code and endpoints without any further click.
- While active the primary button reads **Disconnect** (with matching tooltip); idle it reads **Accept**.
- A down-arrow toggle button appears next to Disconnect and opens/closes the popover; the popover is also closable via backdrop/escape and re-openable via the arrow.
- Stopping the server hides the popover and the arrow button, returning the control to the single **Accept** button.
- Tests cover: popover auto-opens after a successful start, the "Disconnect" label/tooltip in the active state, and the arrow button toggling the popover.

## see also
- `design\feature_descriptions\ready\F_042_remote_control_accept_ui.md`
- `design\feature_descriptions\ready\F_043_remote_control_lan_discovery.md`
- `design\feature_descriptions\ready\F_041_remote_connect_button_and_dialog.md`
