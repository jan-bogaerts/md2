---
id: F-038
title: resizable splitter for the editor conversation panel
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Make the agent-conversation panel at the bottom of the text view resizable with a horizontal splitter, as described in the agents design ("horizontal splitter is used, bottom section shows active conversation").

## Current state
Toggling the Agents button in `TextView` (`app/src/components/text_view/text_view.tsx`) shows a bottom panel with a fixed `CONVERSATION_PANEL_MIN_HEIGHT` (220px) behind a static `Divider`. The user cannot trade editor space against conversation space; long conversations force scrolling inside a small pane.

## implementation details
- Reuse the drag pattern already proven in the app rather than adding a dependency: `SplitLayout` (`app/src/components/shell/split_layout.tsx`) implements a vertical splitter for the left panel; extract or mirror its pointer logic as a horizontal variant (`orientation: 'horizontal'`) and place it between the editor pane and the conversation panel.
- Constrain the panel between a minimum (current 220px) and a maximum (e.g. 80% of the pane); persist the chosen height in component state only (no config entry needed).
- Keyboard accessibility: the divider gets `role="separator"` with arrow-key resizing, matching whatever `SplitLayout` already does (add it there too if missing).
- Mobile keeps the current fixed behavior; the splitter is desktop-only like the left-panel splitter.

## acceptance criteria
- On desktop, dragging the divider above the conversation panel resizes it live within min/max bounds; the editor shrinks/grows accordingly.
- The panel toggle, conversation list, continue and input behaviors are unchanged.
- Tests cover the resize state changes (pointer events adjusting height within bounds), mirroring the existing `split_layout.test.tsx` approach.

## see also
- `design\architecture\initial description\agents.md`
- `design\feature_descriptions\ready\F_012_agents.md`
- `design\feature_descriptions\ready\B_012_left_panel_layout.md`
