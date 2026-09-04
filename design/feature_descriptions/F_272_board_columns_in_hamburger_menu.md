---
author: 
id: F_272
internalId: 056265ee-3d0f-4922-8e2d-282f91bad667
title: Board columns in hamburger menu
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__056265ee-3d0f-4922-8e2d-282f91bad667.json
policy:
after: 9d5878e6-2d20-4574-971d-57dbd82eb389
---
The hamburger me´u is shown when the screen is small.

When the screen is large, at the top of the columns, we show the nr of cards in each column.

Add count of cards aligned to the right. Just the number

## Current state

On small screens, `ProjectWorkspace` supplies `MobileCardViewMenu` to `MobileMainWindow`. The drawer shows this menu while card view is active. `useCardViewColumns` returns configured columns in project-state order, including non-empty columns and empty columns marked `alwaysVisible`. Each menu row shows status color, status name, and selected state, but no card count.

Only active cards belong to board columns; background cards are excluded. `useCardColumnCards` already provides ordered active-card paths for one status and updates after cards are added, removed, reordered, or moved between statuses. Desktop `CardColumn` uses this hook and shows its count in the column header.

## implementation details

* Add a mobile menu-item component in its own file. It receives one `VisibleCardColumn` and the drawer-close callback, subscribes through `useCardColumnCards(column.status)`, selects that status through `mobileCardViewService`, then closes the drawer.
* Render status dot and status label unchanged. Add a flex spacer followed by `cardPaths.length`, rendered as plain text at the right edge. Do not use a badge, chip, prefix, or suffix; `0` is shown for an empty `alwaysVisible` column.
* Keep `MobileCardViewMenu` responsible for obtaining visible columns and selected column. Moving per-row count subscription into the menu-item component limits updates to the row whose membership changed.
* Keep configured order, empty-column visibility, `Unassigned` label, selected-row behavior, and desktop column headers unchanged.
* Extend `mobile_card_view_menu.grouped.test.tsx` to cover initial counts, zero count, live count changes, selection, and drawer close. Run this focused test and app lint.

## acceptance criteria

* While card view is active on a small screen, every visible board-column row in the hamburger drawer shows its active-card count as a bare number aligned to the right.
* Count equals number of active cards whose status matches that row. Background cards are not counted.
* Empty configured columns remain hidden unless `alwaysVisible` is true. An empty `alwaysVisible` column shows `0`.
* Adding, removing, or moving a card updates affected counts without closing and reopening drawer.
* Status color, configured order, `Unassigned` label, selected-row highlight, column selection, and drawer closing continue to work.
* Desktop board count chips and desktop navigation remain unchanged.
* Focused mobile-menu tests pass, and app lint reports no errors or warnings.
