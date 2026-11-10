---
author: 
id: J_69
internalId: 3ebe8ff2-d685-40eb-8937-0bba0f8d5487
title: poor object editor behaviour
status: ready
owner: 
affects:
agents:
  - design/activity/card__3ebe8ff2-d685-40eb-8937-0bba0f8d5487.json
policy:
changedFiles:
  - app/src/components/json_data_editor/json_data_editor.test.tsx
  - app/src/components/json_data_editor/json_object_editor.tsx
  - app/src/visual_j69.tsx
  - app/visual_j69.html
---

we just introduced the new json editor. it contains an object editor which shows 2 columns: the fieldname: field value (can be a button.

* first, show the button as links
* add a header
* show in a table style, so horizontal row indicators
* the column resizer jumps back to the original position first when you want to resize, so it is poorly implemented
* the column divider should be a thin line, the drag area may be wider
* the field-value inputs should use the remaining width of the value column

## Current state

`JsonObjectEditor` renders object properties in a two-column CSS grid without column headers or horizontal row dividers. Nested object and array values use outlined `Open ...` buttons, so navigation controls look heavier than inline values. Scalar inputs keep their intrinsic width instead of filling the remaining value-column space.

The field-name splitter uses the pointer's absolute position inside the editor to calculate column width. Container padding and grid gaps are included in that position but not in the stored width, so the column jumps when dragging starts. The full six-pixel drag target is also painted as the divider, which makes the visible line too heavy.

## implementation details

* Keep object fields in one resizable two-column layout. Add a header row labelled `Field` and `Value`, and separate header and data rows with one-pixel horizontal `divider` lines so the form reads like a table.
* Render nested object and array drill-in controls as link-style text buttons: buttons with hyperlink styling, not URL anchors. Keep their current `document.drillInto` navigation, labels, keyboard access, and focus behavior.
* On pointer down, store both pointer X position and current field-name width. During movement, add pointer delta to stored width, then clamp against existing minimum field and value widths. Pointer up, cancellation, and lost capture end the same bounded drag session.
* Keep a wider splitter hit target for pointer and touch input, but draw a centered one-pixel divider inside it. Use theme `divider` color at rest and `primary.main` for hover, focus, and active states.
* Make `TextField` controls fill the value column's available width. Preserve the minimum value-column width and allow controls to shrink with the editor without causing horizontal overflow. Keep checkbox controls at their natural size.
* Extend `json_data_editor.test.tsx` with object header, link-style drill-in, no-jump pointer resize, and clamping coverage. Keep existing keyboard resize and breadcrumb navigation behavior. Verify divider thickness, hit-target width, hover, focus, active state, and light and dark themes manually because these are visual styling requirements.

## acceptance criteria

* Object editor shows `Field` and `Value` headers above property rows.
* Each object property row has a horizontal divider, using theme colors in light and dark modes.
* Nested object and array values appear as link-style controls and still open the selected value by pointer or keyboard.
* Starting a drag from any point in splitter hit target keeps current column width until pointer moves; movement changes width only by pointer movement distance.
* Pointer resizing cannot make field-name column narrower than its minimum or leave value column narrower than its minimum. Keyboard resizing keeps same bounds.
* Splitter presents a one-pixel visible divider while retaining wider pointer and touch hit target. Hover, keyboard focus, and active drag remain visible.
* String, number, and null `TextField` controls use all available value-column width and shrink with the editor without horizontal overflow.
* Focused JSON editor tests and `npm run lint` pass.
