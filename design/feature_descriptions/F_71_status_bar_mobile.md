---
author: 
id: F_71
internalId: 58f7a536-89fd-490b-8112-2a850481bf23
title: Status bar mobile
status: ready
owner: 
affects:
agents:
  - design/activity/card__58f7a536-89fd-490b-8112-2a850481bf23.json#conversation=agent-9d6b99ab-5203-4a26-883a-838c7a6cc60d
  - design/activity/card__58f7a536-89fd-490b-8112-2a850481bf23.json#conversation=agent-f8fc8085-fcc1-4e99-a53b-fe78097f4a9a
policy:
after: 3d893637-4714-428d-be90-b839925b7cad
---
On mobile, user should also have project status info.

## Current state

`MainWindow` renders the 32px `StatusBar` only above MUI's `md` breakpoint. Small-screen mode therefore hides card totals, local-save and remote-push state, project agent usage, Codex rate limits, remote-control state, Caps Lock, and the running-agent count.

The small-screen toolbar already contains the menu, application tabs, project name, create action, and search. Adding the complete status bar there would reduce the remaining project-name space. `MobileMainWindow` already provides a 300px hamburger drawer with a scrollable navigation body and a pinned footer containing the GitHub account control.

## Implementation details

- Add a compact **Project status** section to the hamburger drawer, directly above the existing GitHub account footer. Keep it pinned with the footer while the navigation body remains independently scrollable.
- Present the information as touch-friendly rows rather than copying the horizontal desktop status-bar layout:
  - card total and active-card count;
  - local save state and remote push state;
  - running-agent count;
  - project agent token usage;
  - Codex rate-limit usage when available;
  - remote-control state when active;
  - Caps Lock only while enabled.
- Always show card counts, save/push state, and running-agent count. Keep Codex limits, remote control, and Caps Lock conditional in the same circumstances as the desktop status bar.
- Keep project agent usage, Codex usage, and running-agent rows interactive. Opening a row shows the same details as desktop in a small-screen-safe dialog or sheet that fits the viewport. Share the detail content with the desktop popovers; do not duplicate the usage or rate-limit calculations.
- Add a small warning badge to the existing hamburger button when hidden status needs attention: local changes are not saved, changes are ready to push or currently pushing, a Codex limit is near or reached, or remote control is active. The badge must not change the button's accessible name or click behavior.
- Put new drawer presentation in its own component. Status leaf components continue to own their subscriptions so opening the drawer or changing one status does not rerender the complete workspace.
- Keep the desktop `StatusBar`, small-screen toolbar contents, navigation behavior, GitHub footer control, and project workspace height unchanged.
- Use theme palette roles and existing status icons. Separate the status section and account footer with one divider; do not introduce a persistent bottom bar that reduces the small-screen workspace.
- Add focused tests for drawer placement, always-visible and conditional rows, detail interactions, warning-badge conditions, accessibility, and unchanged desktop rendering.

## Acceptance criteria

- Below the `md` breakpoint, opening the hamburger drawer shows a **Project status** section directly above the GitHub account footer.
- The section shows card totals, active cards, local save state, remote push state, and running-agent count, with values updating while the drawer is open.
- Project agent usage, available Codex usage, active remote-control state, and active Caps Lock state are represented consistently with desktop; conditional rows are absent when not applicable.
- Tapping project usage, Codex usage, or running agents opens its detail view without horizontal overflow on a 320px-wide viewport.
- The hamburger button shows a non-color-only warning badge for unsaved, pending/pushing, near-limit/reached, or active remote-control state, and clears it when no attention state remains.
- The menu button and every interactive status row have accessible names and keyboard focus behavior.
- The navigation area still scrolls independently, while Project status and the GitHub account control remain reachable at the bottom of the drawer.
- Desktop keeps the existing 32px status bar and does not gain the mobile drawer presentation.
