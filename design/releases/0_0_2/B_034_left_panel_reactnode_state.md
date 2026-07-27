---
id: B-034
title: left panel content is rendered JSX pushed into parent state
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 779370bf-e8cb-493c-8420-1e373bd66353
---

## Problem
The B-012 fix wired the left splitter panel correctly, but the mechanism inverts React's data flow: `MainWindow` holds `useState<ReactNode>` (`leftPanelContent`), and children fill it by calling `onLeftPanelContentChange(<JSX/>)` from effects — the callback is threaded `MainWindow` → `ProjectWorkspace` → `TextView`/card navigation (`app/src/components/shell/main_window.tsx`, `app/src/components/project_workspace.tsx`, `app/src/components/text_view/text_view.tsx`).

Storing rendered elements in an ancestor's state means:

- the panel content is a snapshot: it only updates when the producing effect re-runs, so its dependency arrays must enumerate every value the JSX closes over (easy to miss, produces stale-panel bugs);
- effect-ordering is load-bearing — `ProjectWorkspace` already guards on `viewMode` to avoid one view clobbering another view's panel content, and unmount/cleanup must remember to reset to `null`;
- the left panel cannot be rendered or tested in isolation, and React DevTools shows opaque element trees in state.

## Fix
- Replace the ReactNode state with declarative composition. Two idiomatic options; pick one:
  1. **View-model:** children publish plain data + callbacks (e.g. `{ kind: 'tree', nodes, onSelect }` / `{ kind: 'columns', names, onSelect }`) through the existing callback or a small context; `MainWindow` renders a `LeftPanel` component that maps the model to JSX.
  2. **Slot component:** render the left panel content where it is declared using a portal-based slot (`<LeftPanelSlot>` renders children into the panel container), keeping normal React data flow and updates.
- Keep the mobile drawer behavior unchanged (same content source for splitter panel and drawer).
- Remove the `viewMode` guard workaround once content is derived declaratively.

## acceptance criteria
- No component stores `ReactNode` in state for the left panel; content updates automatically when its inputs change (no effect dependency lists reproducing the JSX closure).
- Tree and card-column navigation still appear in the desktop splitter panel and the mobile drawer, switching correctly with the view mode.
- The left panel content can be rendered in a test without mounting `MainWindow`.
- Existing B-012/F-006 tests keep passing; a regression test covers panel content updating when the underlying tree/columns change without a view-mode switch.

## see also
- `design\feature_descriptions\ready\B_012_left_panel_layout.md`
- `design\feature_descriptions\ready\F_006_text_view.md`
- `design\architecture\architectural_decisions.md`
