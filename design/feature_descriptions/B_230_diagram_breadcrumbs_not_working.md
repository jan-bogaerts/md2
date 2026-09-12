---
author: 
id: B_230
internalId: 02127bb8-87e9-4515-89b9-103550e2d125
title: Diagram breadcrumbs not working
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__02127bb8-87e9-4515-89b9-103550e2d125.json
policy:
after: 3ca60eff-65bc-44d0-929f-451e034102c4
---
The breadcrumbs bar on the diagram view needs fixing:

* The first item is disabled. It should never be disabled. Currently there are even multiple root diagrams available (architecture, dependecies), but it is still disabled. At the very least there should be a ´´ew´ menu item which sows the action popup with the next not yet run root action selected.
* Back button should be icon, no text.
* There needs to be a + icon at the end of the list , enabled when something is selected in the diagram. Click opens action popup with child actions on selected
* The bar is currently above the diagram. It should be on top  but inside the view. No background panel, just the bar.

## Current state

`DiagramView` renders an outlined Back text button and MUI `Breadcrumbs` in a layout row above diagram content. It disables current crumb; at root, first crumb is current and therefore disabled even when `DiagramViewService` indexes other root diagrams. Saved root diagrams can only be chosen from empty state, while root action popup is opened through separate movable FAB.

Selecting Current diagram node or edge stores only its identity in `DiagramViewService`. Child action popup can open only from item context menu, where selected action ID and item label are available. Breadcrumb bar has no root-choice menu or selected-item child-action button.

## implementation details

* Extract breadcrumb bar into its own component. Render it as transparent overlay at top inside relative diagram content surface; do not add `Paper`, background, border, or elevation. Keep existing movable root-action FAB.
* Replace Back text button with `IconButton` containing `ArrowBackOutlined`. Keep `aria-label="Back"`, tooltip, existing one-level navigation, and disabled state when active path has one or zero records.
* Keep first breadcrumb enabled, including when it is current. Activating it opens service-owned menu containing every saved root diagram plus `New`. Saved item calls existing `navigateToSavedDiagram`; `New` opens root `ActionPopup`.
* For `New`, preselect first matching root action, in action selector order, whose `index.roots[action.id]` has no saved diagram. When every root action has run, omit explicit initial action so existing popup selection rules apply. Disable `New` when no root diagram action exists.
* Extend `DiagramViewService` selected-item state to retain active diagram ID, item ID, item label, and object kind as one stable snapshot. Publish scoped selection event, clear selection when active source changes, and expose methods used by breadcrumb component. Existing per-object selection subscriptions keep current highlight behavior.
* Add trailing `Add` icon button. Disable it until Current diagram node or edge is selected. On activation, open `ActionPopup` anchored to button with `diagramContext('child', activeDiagramId, itemId, itemLabel)`; popup filters child actions and applies normal initial-action selection.
* Keep later crumb behavior: activating non-current crumb truncates active path, and current non-root crumb stays disabled. Root menu, child popup, and navigation failures remain service-owned and report through `dialogService`.
* Add focused component and service tests for icon-only Back control, root crumb menu and navigation, unrun root-action choice and all-run fallback, Add enablement and child context, selection reset after navigation, and unchanged later-crumb navigation.

## acceptance criteria

* Breadcrumb bar overlays top of diagram content without background panel and no longer consumes row above diagram.
* Back is icon-only, has `Back` accessible name and tooltip, navigates one level, and is disabled at root or empty state.
* First crumb is always enabled. Its menu lists all saved root diagrams and `New`, including while current diagram is root.
* Choosing saved root diagram loads that record without opening action popup. Choosing `New` opens root action popup and selects first root action with no saved root diagram; when all have run, normal popup default applies.
* Trailing Add button is disabled without selected Current node or edge. Selecting one enables button; activating it opens child action popup for active diagram ID, selected item ID, and selected item label.
* Navigating to another diagram clears prior selection, disables Add, and cannot run child action against stale item.
* Existing movable root-action FAB, item context menu, saved-child navigation, later breadcrumbs, diagram persistence, and edit comparison behavior remain unchanged.
* Focused Diagram view and service tests pass; app lint reports no errors or warnings.
