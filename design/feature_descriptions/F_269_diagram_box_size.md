---
author: 
id: F_269
internalId: eb493428-5ac9-4256-aaa3-da3a26d73aca
title: diagram box size
status: ready
owner: 
affects:
agents:
  - design/activity/card__eb493428-5ac9-4256-aaa3-da3a26d73aca.json
policy:
branch: f_269_diagram_box_size
worktree: 1
---

is it possible to have the initial box size fit the size of the content?

right now especially when we have longer sublabels, the label of the box is no longer visible, which is annoying.

## Decision

The box keeps a fixed size. When the text does not fit, the content area scrolls instead of the box growing.

This is deliberately not an auto-sizing feature. `app/src/services/diagrams/diagram_layout.ts` is the single source of geometry truth: it packs nodes left to right using each node's width, routes orthogonal edges to node rectangles, sizes group frames from member bounds, and derives the scroll surface size from the outermost node edges. A box that grew on its own in CSS would leave every one of those computations reading a stale rectangle, so arrows would stop at the wrong place and neighbours would overlap. Making the layout aware of the real content size would require either a character-width estimate or a render-and-measure pass, both of which are more machinery than the problem needs. Keeping the size fixed means `diagram_layout.ts` is not touched at all.

## Current state

`app/src/components/diagram_view/diagram_node.tsx` renders each node as a MUI `ButtonBase` whose `sx` sets `height: node.height`, `width: node.width`, `overflow: 'hidden'`, `flexDirection: 'column'`, and `justifyContent: 'center'`. Inside it, a single `Box` stacks the optional tag (`Typography` variant `overline`), the label (variant `body2`, weight 600), and the optional sublabel (variant `caption`).

`app/src/services/diagrams/diagram_layout.ts` supplies those dimensions through `nodeWidth` and `nodeHeight`. Both first honour `node.width` and `node.height` when the diagram JSON supplies them, then apply kind-specific constants for flow decisions and terminators, and otherwise fall back to `DEFAULT_NODE_WIDTH = 160` and `DEFAULT_NODE_HEIGHT = 72`. Entity nodes are the one exception already sized from content: `nodeHeight` returns `ENTITY_HEADER_HEIGHT + node.fields.length * ENTITY_FIELD_HEIGHT`.

The reported annoyance follows from the combination of the three `ButtonBase` properties above. When a long sublabel makes the stacked content taller than the fixed 72 pixels, the content is first centred vertically and then clipped by `overflow: 'hidden'`. Centring puts the excess at both ends, so the overflow is cut from the top as well as the bottom. The tag and the label sit at the top, so they are what disappears. The user sees a box whose title is gone while the sublabel that caused the problem is still partly readable.

Two further details matter for this card:

* Node geometry already flows from the diagram JSON through `node.width` and `node.height`. User-driven resizing of diagram items is planned (listed as out of scope in [F_267](design/feature_descriptions/F_267_render_diagrams_from_data.md) and covered by [F_255](design/feature_descriptions/F_255_make_diagrams_editable.md)), and it will work by writing those two fields. Nothing in this card may assume the height is 72.
* Zoom is planned in [F_268](design/feature_descriptions/F_268_diagram_add_support_for_zoom.md), which is sequenced after this card.

## Implementation details

All changes are confined to `app/src/components/diagram_view/diagram_node.tsx`. `diagram_layout.ts`, `diagram_data.ts`, and `DEFAULT_DIAGRAM_FOOTER` in `app/src/data/data_types.ts` are unchanged, because neither the geometry contract nor the agent's authoring instructions change.

### Scroll container

Wrap the existing content `Box` and the entity fields `Box` in a single scroll wrapper `Box`. The wrapper is a flex child of the `ButtonBase` with `flex: 1`, `minHeight: 0`, `overflowY: 'auto'`, and `overflowX: 'hidden'`. `minHeight: 0` is required: without it a flex child refuses to shrink below its content size, the wrapper grows past the button, and nothing ever scrolls.

The `ButtonBase` keeps `overflow: 'hidden'` so that scrolled content stays clipped to the rounded border, and keeps `height: node.height` and `width: node.width` read straight from the positioned node. No literal fallback dimension is introduced in the component.

Move `justifyContent` from the `ButtonBase` to the wrapper and set it to `safe center`. Plain `center` would keep short content nicely centred but makes the top of overflowing content permanently unreachable, because a centred flex container pushes the overflow above the scroll origin where no scrollbar can reach it. The `safe` keyword falls back to start alignment as soon as the content overflows, which is exactly the desired behaviour: short labels stay centred, long ones anchor to the top so the tag and label are the first thing visible. The app renders in Electron, so Chromium support for `safe center` is guaranteed and no fallback is needed.

The `fanIn` badge for dependency diagrams stays a direct absolutely positioned child of the `ButtonBase`, outside the wrapper, so it does not scroll away with the text.

### Horizontal fit

The width stays fixed, so text must wrap rather than push sideways. Add `overflowWrap: 'anywhere'` to the label and sublabel `Typography` elements. Without it a single long unbroken token, such as a file path or an identifier, overflows horizontally and is clipped by the wrapper's `overflowX: 'hidden'`.

### Click guard

The scroll wrapper sits inside a `ButtonBase`, so dragging the scrollbar thumb produces a mousedown and a mouseup both inside the button, which fires the node's click handler and opens the drill-down popup the user did not ask for.

Guard it by recording the wrapper's `scrollTop` on mousedown and comparing it in `handleClick`: if the value changed between the two events, the gesture was a scroll, so return without calling `onSelect`. A wheel scroll produces no click at all and needs no guard.

### Keyboard and accessibility

`handleKeyDown` keeps its current behaviour: Enter and Space select the node and call `preventDefault`, so Space does not page the scroll container. Node selection takes priority over scrolling.

The scroll region is therefore reachable by pointer and wheel only. Making it keyboard-scrollable would mean putting a focusable element inside a button, which is invalid and breaks the node's own focus handling. This is an accepted limitation of the fixed-size approach, and it disappears once users can resize a box to reveal its content.

### Forward compatibility with resizing

Every dimension the component uses comes from `node.width` and `node.height`. When resizing lands and writes new values into the diagram JSON, `nodeWidth` and `nodeHeight` return them, the box changes size, and the wrapper's scroll behaviour follows automatically: a taller box scrolls less, and a box tall enough for its content shows no scrollbar and re-centres its content through `safe center`. No part of this card needs revisiting for that feature.

## Acceptance criteria

1. A node whose tag, label, and sublabel together exceed the node height shows its tag and label at the top of the box. Neither is clipped.
2. The remaining text in that node is reachable by scrolling the content area with the mouse wheel or the scrollbar.
3. A node whose content fits within the node height shows that content vertically centred, exactly as before this card, and shows no scrollbar.
4. Node positions, node sizes, edge paths, group frames, and the diagram surface size are identical to before this card for the same input data. `app/src/services/diagrams/diagram_layout.ts` and its tests are unchanged.
5. A label or sublabel containing a single unbroken token longer than the box width wraps within the box instead of being cut off at the right edge.
6. Dragging the scrollbar thumb inside a node and releasing the mouse over that node does not select the node or open the drill-down popup.
7. Clicking a node without scrolling still selects it, and Enter and Space on a focused node still select it.
8. The `fanIn` badge on dependency diagram nodes stays fixed in the top-right corner of the box while the text behind it scrolls.
9. Entity nodes keep their divider between the header block and the field list, and their field list scrolls with the header rather than separately from it.
10. Flow start and end nodes in the `state` preset, which render no text, are visually unchanged and show no scrollbar.
11. A node given an explicit `height` in the diagram JSON honours that height, and the scroll behaviour above applies at that height rather than at the 72 pixel default.
