---
author: 
id: B_231
internalId: 42bec8db-b7c5-4124-937f-7d0658050f20
title: Diagram view layout issue
status: ready
owner: 
affects:
agents:
  - design/releases/0_6_0/card__42bec8db-b7c5-4124-937f-7d0658050f20.json
policy:
changedFiles:
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/tabbed_diagram_comparison.test.tsx
  - app/src/components/diagram_view/tabbed_diagram_comparison.tsx
after: 02127bb8-87e9-4515-89b9-103550e2d125
---

There appaers to be a bug in the layout of the diagram view. When in verical split and we go to tabs  all ok. When from horizontal split to tabs, remains horizontal split layout

## Current state

`DiagramComparisonLayout` subscribes to `DiagramComparisonLayoutService.comparisonMode` and replaces vertical, horizontal, or tabbed comparison when mode changes. Mode state changes correctly; divider state is independent.

`TabbedDiagramComparison` keeps Current and New panels mounted to preserve each surface's edit and viewport state. It marks inactive panel with HTML `hidden`, but both MUI `Paper` panels also apply `display: 'flex'`. Generated author CSS can override browser's default styling for `hidden`, so inactive panel still participates in layout. Because horizontal comparison and broken tabbed comparison both stack Current above New, switching from horizontal appears to retain horizontal split. Switching from vertical changes side-by-side layout to stacked layout, which masks same tab-panel fault.

Current tests check `hidden` attribute and selected mode, but do not verify inactive panel is removed from layout.

## implementation details

* In `TabbedDiagramComparison`, keep both panels mounted, their `hidden` attributes, and existing tab/panel ARIA links. Explicitly render active panel with `display: 'flex'` and inactive panel with `display: 'none'`. Here, inactive means panel remains mounted in React but occupies no layout space and cannot receive pointer or keyboard interaction.
* Limit production change to tabbed panel visibility. Do not change comparison-mode state, divider ratios, edit-session state, vertical or horizontal split components, or mobile fallback to tabbed mode.
* Extend focused tabbed-comparison tests to verify exactly one panel participates in layout, first for Current and then for New, while both panels remain mounted.
* Add regression coverage for horizontal-to-tabbed and vertical-to-tabbed transitions. Verify tabbed layout has no split separator and only active panel occupies comparison area.

## acceptance criteria

* Switching from horizontal comparison to tabbed comparison removes horizontal split and divider immediately. Only selected tab panel occupies comparison area.
* Switching from vertical comparison to tabbed comparison keeps existing correct behavior. Only selected tab panel occupies comparison area.
* Selecting Current or New shows that panel and removes other panel from layout; both panels stay mounted.
* Tab switches preserve edits, selection, active tool, scroll position, and zoom for each surface.
* Switching among vertical, horizontal, and tabbed modes does not change diagram data, dirty state, or stored divider ratios.
* Mobile tabbed fallback shows only selected panel without workspace overflow.
* Focused diagram comparison tests pass; app lint reports no errors or warnings.
