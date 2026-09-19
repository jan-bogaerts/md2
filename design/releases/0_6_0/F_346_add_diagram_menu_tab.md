---
author: 
id: F_346
internalId: 38518a81-c62a-4c06-a5fb-677f1753b2dd
title: Add diagram menu tab
status: ready
owner: 
affects:
agents:
  - design/releases/0_6_0/card__38518a81-c62a-4c06-a5fb-677f1753b2dd.json
policy:
changedFiles:
  - app/src/components/diagram_view/diagram_add_control.test.tsx
  - app/src/components/diagram_view/diagram_add_control.tsx
  - app/src/components/diagram_view/diagram_change_review_button.tsx
  - app/src/components/diagram_view/diagram_comparison.test.tsx
  - app/src/components/diagram_view/diagram_comparison_layout.test.tsx
  - app/src/components/diagram_view/diagram_comparison_layout.tsx
  - app/src/components/diagram_view/diagram_comparison_menu_control.test.tsx
  - app/src/components/diagram_view/diagram_comparison_menu_control.tsx
  - app/src/components/diagram_view/diagram_copy_button.tsx
  - app/src/components/diagram_view/diagram_creation_tool_sample.tsx
  - app/src/components/diagram_view/diagram_creation_tools.ts
  - app/src/components/diagram_view/diagram_cut_button.tsx
  - app/src/components/diagram_view/diagram_delete_button.tsx
  - app/src/components/diagram_view/diagram_edit_button.tsx
  - app/src/components/diagram_view/diagram_fragment_button.tsx
  - app/src/components/diagram_view/diagram_legend_button.tsx
  - app/src/components/diagram_view/diagram_menu_tab.test.tsx
  - app/src/components/diagram_view/diagram_menu_tab.tsx
  - app/src/components/diagram_view/diagram_menu_tool_button.tsx
  - app/src/components/diagram_view/diagram_metadata_button.tsx
  - app/src/components/diagram_view/diagram_new_pane.tsx
  - app/src/components/diagram_view/diagram_paste_button.tsx
  - app/src/components/diagram_view/diagram_toolbox.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.tsx
  - app/src/components/diagram_view/diagram_toolbox_action_button.tsx
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/diagram_view.tsx
  - app/src/components/diagram_view/tabbed_diagram_comparison.test.tsx
  - app/src/components/diagram_view/tabbed_diagram_comparison.tsx
  - app/src/components/diagram_view/vertical_diagram_comparison.test.tsx
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/shell/menu/app_menu.tsx
  - app/src/components/shell/menu/menu_icon_button.tsx
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
after: 1be32ecd-4fa8-4926-a390-3332a18226d5
---
* Visible when in diagram view
* Contains:
  * The edit button
  * the 3 buttons to select the view
  * The edit functions: select, cut, copy, delete,...
  * A button to select the ´add´ tool, followed with a dropdown button (attached to ´add´ button). The dropdown button shows a popper to select the tool
* Use icons. For the ´add´ tools, use the same image as in the legend.
* So remove toolbox and buttons from diagram surface

## Current state

`AppMenu` has Home and Run tabs. Diagram view is selected from Home, but has no menu tab of its own. `DiagramView` renders Edit diagram in its navigation row. During editing, `DiagramComparisonLayout` renders Vertical, Horizontal, and Tabbed buttons above diagram content, while each visible New pane owns a floating, resizable `DiagramToolbox` with Edit, Nodes, Edges, Groups, and Others tabs. Toolbox buttons use text; legend entries use role swatches and rendered edge samples.

Tool choice and comparison mode already belong to `DiagramEditSessionService` and `DiagramComparisonLayoutService`. Toolbox tab selection and stored toolbox size exist only for floating toolbox. Here, "diagram surface controls" means Edit diagram, comparison-layout selector, and floating toolbox; diagram navigation, zoom sliders, legend controls, emphasis exit, item menus, and floating action button remain on diagram view.

## implementation details

* Add a Diagram app-menu tab only while `WorkspaceViewService.viewMode` is `diagrams`. If user leaves diagram view while this tab is selected, select Home so MUI Tabs always has a visible selected value.
* Put diagram controls in a dedicated menu-tab component. Before editing, show icon-based Edit diagram action when a current diagram exists. During editing, show icon-based Select, Pan, Cut, Copy, Paste, Delete, change review, metadata, and legend actions with existing availability rules. Keep each changing control subscribed to its existing service-owned primitive through `useSyncExternalStore`.
* Move Vertical, Horizontal, and Tabbed comparison selection into diagram menu. "Comparison layout" means arrangement of saved Current diagram and editable New diagram. Keep mobile behavior: Tabbed is effective layout and split choices are disabled. `DiagramComparisonLayout` renders selected panes but no selector above diagram content.
* Replace creation sections with attached split Add control. Main Add button reactivates last selected creation tool; adjacent dropdown opens a popper listing only tools valid for current diagram type. Choosing node, edge, group, or sequence-fragment entry selects and activates it. Store last selected creation tool in edit-session service, separate from active tool, so Select or Pan does not erase it; reset it when edit session starts or ends.
* Use outlined MUI icons for general actions. Add entries reuse legend visuals: node entries use same colored role rectangle for tool's created role, and edge entries use `DiagramLegendConnectionSample` for tool's edge kind; group and fragment entries use matching diagram-renderer samples. Every icon-only control has tooltip and accessible name, and Add split segments expose selected tool and expanded state.
* Remove floating toolbox from `DiagramNewPane`, including viewport boundary state, toolbox visibility plumbing, persisted toolbox size, and obsolete toolbox-section state. Keep existing edit operations and diagram-type filtering; change only where and how controls render.
* Add focused tests for conditional menu-tab visibility and fallback, read-only versus editing controls, comparison selection and mobile constraints, Add popper filtering and activation, reused legend samples, absence of moved surface controls in every comparison layout, granular subscriptions, and keyboard-accessible controls. Run related tests and app lint.

## acceptance criteria

* Diagram tab is visible exactly while workspace view is Diagrams; leaving that view never leaves a hidden tab selected.
* With current diagram and no edit session, Diagram tab offers Edit diagram. Starting editing focuses New diagram as before.
* During editing, Diagram tab offers all existing edit actions and Vertical, Horizontal, and Tabbed comparison choices; their enabled, selected, and mobile states match existing behavior.
* Add is an attached split control. Main segment activates last selected valid creation tool. Dropdown lists only creation tools supported by active diagram type, and choosing entry activates it.
* Add menu node and edge images match legend role and connection rendering; other controls use labelled, tooltip-backed icons and work by keyboard.
* Edit diagram, comparison-layout selector, and floating toolbox no longer render over diagram content. Navigation, zoom, legend, emphasis, item-menu, and action controls remain unchanged.
* Moving controls does not change original or editable diagram data, dirty state, selection, active tool, comparison mode, zoom, or change descriptions except when user invokes corresponding control.
* Changing one service-owned menu state value rerenders only control that reads it, not diagram roots, comparison roots, unrelated menu controls, or diagram objects.
* Focused app-menu, diagram-menu, comparison, edit-session, and diagram-view tests pass; app lint passes.
