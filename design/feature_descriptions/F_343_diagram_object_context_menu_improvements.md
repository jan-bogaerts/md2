---
author: 
id: F_343
internalId: aad6e895-0481-4a5f-b6b3-e4c6d1ac655e
title: diagram object context menu improvements
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__aad6e895-0481-4a5f-b6b3-e4c6d1ac655e.json
policy:
---

on diagram view, the context menu of the objects currently has 2 static titles 'actions' and 'saved diagrams' with below them, each respectable list of items. The static titles should become sub menus. Actions would have as menu items: the list of actions that can be executed, saved diagrams the list of already existing diagrams.

## Current state

`DiagramItemMenu` opens one flat MUI context menu at selected diagram item's pointer position. Static `Actions` and `Saved diagrams` headings divide matching child actions from saved child diagrams. Empty groups show disabled `No child actions` or `No saved diagrams` rows.

Actions come from `actionsForContext` using selected diagram, item, and label. Saved diagrams come from `DiagramViewService.getSavedChildren` for same diagram and item. Selecting action opens `ActionPopup` with action preselected; selecting saved diagram navigates without opening popup. `DiagramViewService` owns selected-item menu state and closes menu after successful selection.

`ActionAgentSelectors` already provides nested-menu behavior used elsewhere: top-level items expose submenus with chevrons, mouse activation, `ArrowRight` opening, and `ArrowLeft` closing with focus returned to parent item.

## implementation details

* Replace static headings and flat choices in `DiagramItemMenu` with two top-level `MenuItem`s: `Actions` and `Saved diagrams`. Give each `aria-haspopup="menu"` and trailing chevron.
* Open one right-aligned nested MUI `Menu` from selected top-level item. Clicking item or pressing `ArrowRight` opens submenu. `ArrowLeft` closes submenu and returns focus to its parent item. `Escape` closes active menu level through normal MUI behavior.
* Keep submenu visibility and anchor in `DiagramViewService` menu state. Opening different submenu replaces current one; closing item context menu also clears submenu state.
* Preserve current action filtering, order, labels, action-popup context, saved-diagram title formatting, navigation, and error reporting. Preserve disabled empty rows inside corresponding submenu.
* Update focused `DiagramView` and `DiagramViewService` tests for submenu contents, empty groups, pointer and keyboard opening, focus return, action selection, saved-diagram navigation, and close-state cleanup. No diagram index, persistence, action definition, or Electron changes.

## acceptance criteria

* Diagram-item context menu contains only top-level `Actions` and `Saved diagrams` items; former static headings and flat child choices are absent.
* Opening `Actions` shows every matching child diagram action in existing order, or disabled `No child actions` when none exist.
* Opening `Saved diagrams` shows every saved child diagram for selected diagram item, using existing titles and order, or disabled `No saved diagrams` when none exist.
* Mouse, `ArrowRight`, `ArrowLeft`, and `Escape` navigation work. Submenu exposes menu semantics to assistive technology, and closing submenu returns focus to parent item.
* Selecting action opens existing action popup with selected action and selected-item context. Selecting saved diagram navigates without opening action popup. Selection or full-menu close leaves no stale submenu open.
* Focused diagram-view and diagram-service tests pass; app lint passes.
