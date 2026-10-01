---
author: 
id: F_391
internalId: 50466266-0fa0-4392-855a-d21513ee700f
title: diagrams autowrap labels and space around
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__50466266-0fa0-4392-855a-d21513ee700f.json
policy:
after: 2775052a-2e84-4466-a320-155c8ec05bac
branch: f_391_diagrams_autowrap_labels_and_space_around
worktree: 3
---
labels on diagram nodes should auto wrap and should use less padding, they are alloed to get closer to the edge.

Lets add both as configurable parameters through the legend item (type).

## Current state

`DiagramNode` renders fixed-size nodes. Its main label and sublabel use `overflowWrap: 'anywhere'`, but the content block has no width constraint when content position centres or right-aligns it, so a long label can still extend past the visible box. Header text has 16 px horizontal and 8 px vertical padding; entity fields use the same padding. Overflow scrolls vertically. On the New diagram, `DiagramInlineNodeControls` replaces the visible main label with a single-line input over the node.

Legend node entries open `NodeFormattingPopover`. Its `Apply` sends role formatting to `DiagramEditSessionService` or `DiagramViewService`; both validate and persist it through `shared/diagram_data.mjs`. `DiagramBoxFormatting` has no wrap or padding fields. One node role setting applies to every node of that role in the diagram, whether the legend is explicit or derived. Connection legend entries have separate formatting.

## Implementation details

* **Terms.** *Auto wrap* means break main label into lines within available node width, including long words or paths. *Inset* means distance from node border to text; it does not change node dimensions or distance between nodes. Here, *type* means node role, the semantic key of a node legend entry.
* Add `autoWrap?: boolean` and `contentInset?: number` to `DiagramBoxFormatting` in `shared/diagram_data.d.mts`. Validate them in `shared/diagram_data.mjs`: boolean and finite pixel number from 0 through 40, respectively. Missing fields mean wrapping on and 4 px inset. Existing diagram files need no migration. Keep unknown-field rejection.
* Add an Auto wrap switch and a Content inset pixel control to the `Box` group in `NodeFormattingPopover`. Initialize from saved values or defaults, retain them alongside existing box settings on Apply, and use the existing Cancel and error paths. Do not add controls to connection formatting.
* In `DiagramNode`, constrain the text block to the space inside the inset for every content position; apply the inset to header and entity fields. Let the main label wrap at word boundaries and break unbroken tokens when Auto wrap is on. When off, keep the main label on one line within the fixed box. Preserve vertical scrolling, sublabel wrapping, and existing tag, field, and badge behavior.
* In `DiagramInlineNodeControls`, use a multiline label editor when wrapping is on and size it within the same inset, so New diagram editing matches Current diagram display. Keep commit, selection, details, and pointer behavior. Both renderers subscribe to their node role's formatting; changing one role updates its nodes without rebuilding the diagram.
* Do not change node geometry in `diagram_layout.ts`: wrapping and inset affect content only. Cover parser validation, formatting Apply/Cancel, Current and New rendering, long unbroken labels, and independent role settings with focused tests.

## Acceptance criteria

1. With no saved settings, main labels wrap within node bounds and have a 4 px inset. Long words and paths break rather than disappear at the side; content taller than the node remains vertically scrollable.
2. A node legend entry can turn Auto wrap off or on and set Content inset from 0 through 40 px. Apply persists both for that role in Current or New diagram; Cancel changes neither. Invalid stored values produce a clear parse error.
3. Changing one role affects every node of that role and no node of another role. Connection formatting remains unchanged. Reopening a saved diagram restores both choices.
4. New diagram's inline editor wraps and respects the inset when Auto wrap is on. Editing and committing a label still work; turning wrapping off shows one line.
5. Node width, height, position, edges, groups, and surface size do not change when either setting changes. Existing scrolling, keyboard selection, and details controls keep working.
