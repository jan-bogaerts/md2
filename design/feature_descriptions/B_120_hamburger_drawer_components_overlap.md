---
author: 
id: B_120
internalId: 4a471f6a-6bca-4990-9e2d-38dc2df2ce9f
title: Hamburger drawer components overlap
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__4a471f6a-6bca-4990-9e2d-38dc2df2ce9f.json#conversation=agent-befb61e1-df1b-42ec-9d35-e6a2ad3772d3
policy:
---

On small screens, project status appears in hamburger drawer, but its top overlaps bottom of board-column list.

## Current state

`MobileMainWindow` uses vertical flex layout for drawer. Theme control sits above navigation area; `MobileProjectStatus` and GitHub account footer sit below it. Navigation area receives remaining height through `flex: 1` and `minHeight: 0`.

Text-view navigation already has independently scrolling child. Board-column branch renders `MobileCardViewMenu` in wrapper without bounded height or overflow handling. When column list exceeds available height, content overflows its wrapper and paints beneath later Project status section, so status rows cover bottom column choices.

## Implementation details

- Make shared navigation area contain child overflow within its assigned drawer height.
- Make board-column wrapper fill available navigation height and scroll vertically when its column list does not fit. Keep existing text-view navigation scroll behavior unchanged.
- Keep Project status and GitHub account footer outside navigation scroll region. They remain reachable and must not overlay board-column choices.
- Preserve current view-mode visibility switching, column selection, drawer-close behavior, drawer width, status-section height limit, and desktop layout.
- Extend `MobileMainWindow` tests to verify board-column branch owns vertical scrolling and existing text-navigation branch still scrolls independently. Add manual responsive check because DOM unit tests do not calculate element overlap.

## Acceptance criteria

- On screen below `md` breakpoint, every visible board-column choice remains readable and selectable; Project status covers none of its content.
- When board-column choices exceed available drawer height, only board-column navigation scrolls. Project status and GitHub account footer stay outside that scroll region and remain reachable.
- Text-view project navigation keeps its existing independent scrolling and does not overlap Project status.
- Switching between card and text views shows correct navigation branch without remounting or duplicating Project status.
- Drawer layout works at 320px viewport width and short viewport heights without horizontal overflow.
- Desktop layout remains unchanged.
