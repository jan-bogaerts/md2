---
author: 
id: J_70
internalId: a1bb555a-bf8b-4111-a211-23e18445fe00
title: improve json list editor
status: ready
owner: 
affects:
agents:
  - design/releases/0.12.0/card__a1bb555a-bf8b-4111-a211-23e18445fe00.json
policy:
changedFiles:
  - app/src/components/json_data_editor/json_array_column_header_cell.tsx
  - app/src/components/json_data_editor/json_array_editor.tsx
  - app/src/components/json_data_editor/json_array_virtual_table.tsx
  - app/src/components/json_data_editor/json_data_editor.test.tsx
  - app/src/services/json/json_data_document.node.test.ts
  - app/src/services/json/json_data_document.ts
after: 3ebe8ff2-d685-40eb-8937-0bba0f8d5487
---

* make columns resizable
* instead of buttons, use a link to open a child object or list. don't use 'open fieldname' but keep it shorter 'open'

## Current state

`JsonArrayEditor` renders arrays through a virtualized MUI table. Object-only arrays use the first-seen union of object field names as data columns; primitive, mixed, and empty arrays use one `values` column. Column widths come from browser table layout and cannot be changed by the user.

Nested object and array cells render outlined buttons whose visible label includes the field name, such as `Open details`. These controls drill into the value through `JsonDataDocument`; they do not navigate to a URL.

## implementation details

* Make every data column resizable from its header. Keep the selection-checkbox column fixed. Use explicit column widths for header and virtualized body cells so both remain aligned, and allow horizontal scrolling when the combined widths exceed the editor width.
* Store array column widths as view data in `JsonDataDocument`, keyed by JSON location and column name. `JsonArrayEditor` reads widths from the document snapshot and calls focused document methods during resize; React components do not become another state owner.
* Add a keyboard-focusable separator to each resizable header boundary. Pointer drag uses pointer movement from the width captured on pointer down, then clamps to a named minimum width. `ArrowLeft` and `ArrowRight` resize by a named step; `Home` selects the minimum. Pointer cancellation and lost capture end resizing.
* Keep the separator hit target wide enough for pointer and touch input, but draw a centered one-pixel line. Use theme `divider` color at rest and `primary.main` for hover, focus, and active drag states.
* Replace each nested-value outlined button with a link-styled button. Visible text is only `Open`; an accessible name includes the field or value column and one-based row number. Keep `JsonDataDocument.drillInto` behavior, keyboard activation, and breadcrumb navigation unchanged.
* Extend `json_data_editor.test.tsx` with pointer and keyboard resizing, minimum-width clamping, header/body width alignment, horizontal overflow, short visible link text, contextual accessible names, and nested object and array drill-in coverage. Verify separator and link styling in light and dark themes manually because these are visual requirements.

## acceptance criteria

* Each JSON array data column has a header separator that resizes that column by pointer or keyboard; the selection column remains fixed.
* Starting a pointer drag does not change column width until the pointer moves. Width changes by pointer movement distance and never becomes narrower than the defined minimum.
* Resized header and virtualized body cells stay aligned. When total column width exceeds available space, the table scrolls horizontally without shrinking columns below their minimum.
* Header separators expose separator role, vertical orientation, current width, and minimum width. Hover, keyboard focus, and active drag states remain visible in light and dark themes.
* Nested object and array cells show link-styled `Open` controls. Each control's accessible name identifies its column and row, and pointer or keyboard activation opens the correct child value.
* Existing inline scalar editing, row virtualization, selection, add, delete, copy, cut, paste, breadcrumbs, and read-only behavior remain unchanged.
* Focused JSON editor tests and `npm run lint` pass.
