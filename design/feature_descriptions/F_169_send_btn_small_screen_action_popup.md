---
author: 
id: F_169
internalId: d7bd3d2f-ec5c-4025-879a-5a715e2b4ffc
title: Send btn Small screen action popup
status: ready
owner: 
affects:
agents:
  - design/activity/card__d7bd3d2f-ec5c-4025-879a-5a715e2b4ffc.json#conversation=agent-fb537e79-a0f5-4267-9deb-4bbf38c1ffee
  - design/activity/card__d7bd3d2f-ec5c-4025-879a-5a715e2b4ffc.json#conversation=agent-a0f04095-7ff7-418f-aacb-4356eafd7e71
policy:
---
When the screen is small, like mobile, on the action popup, the buttons on the bottom row are not visible. The screen is too narrow. When flip phone horizontal, buttons are there. I think problem is only 2 places in grid. Should be flex like on normal width.

To make more room for the buttons at the bottom of the action popup, when in small screen, use l, m, h, instead of low medium high. Also when narrow, the middle section (tokens, changes, lines) should shrink. Drop labels. Use style and colors.

## Current state

`ActionPopupFrame` makes the popup full-screen below the `md` breakpoint. `ActionPopupBottomRow` places agent selectors, usage, and action buttons in one flex row, but gives the first two groups fixed minimum widths of 158 px and 235 px. It also declares itself as an inline-size query container while trying to query its own width; a CSS container query only matches descendants of a container, not the container itself. No ancestor query container exists in this popup path, so its intended `<= 420px` two-column grid never activates. Fixed widths can then push Schedule, Send, Run, Stop, or Finish outside a portrait viewport.

Agent popups render this row inside the prompt surface; command popups render the same row as a separate footer. `ActionAgentSelectors` shows the model and full thinking level in one button. `ActionUsageSummary` shows `tokens:`, `changes:`, and `lines:` labels, with additions and deletions already using success and error theme colors.

## Implementation details

* Define **narrow** as an action-popup footer width of 420 px or less. Add an outer inline-size container in `ActionPopupBottomRow`, then apply its container query to an inner layout row so the query measures the popup rather than the viewport.
* Keep one flex row at narrow widths. Let selector and usage groups shrink with `minWidth: 0`; keep action controls non-shrinking and right-aligned. Ellipsize long model text. Wide layout and footer placement stay unchanged.
* In `ActionAgentSelectors`, show `l`, `m`, or `h` in the closed model button at narrow widths for `low`, `medium`, or `high`. Keep stored values and menu option text unchanged. Keep `none` and `max` unchanged.
* In `ActionUsageSummary`, hide visible `tokens:`, `changes:`, and `lines:` prefixes at narrow widths. Keep numeric values, dotted interactive styling, tooltips, accessible names, and green/red addition/deletion colors. Do not render metrics that currently have no value.
* Update focused component tests for wide and narrow footer layout, thinking-level display, compact usage display, accessible labels, and visible action controls. No service, persistence, action execution, or desktop-host changes are required.

## Acceptance criteria

* At a footer width of 420 px or less, selectors, usage values, and applicable action controls remain in one row; Schedule, Send, Run, Stop, and Finish are not clipped when present.
* At narrow widths, closed model buttons display `l`, `m`, and `h` for low, medium, and high. Menus still display full names and selecting a level stores its existing full value.
* At narrow widths, usage prefixes are absent; token, change, and line values remain readable, changes retain green/red meaning, and each value retains its tooltip and accessible name.
* Long model names shrink with ellipsis instead of displacing action controls.
* Above 420 px, existing full thinking-level names, usage labels, spacing, and alignment remain unchanged.
* Agent and command popups keep current run, schedule, stop, finish, usage-scope, and keyboard behavior in portrait and landscape layouts.
