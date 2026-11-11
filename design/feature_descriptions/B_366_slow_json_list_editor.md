---
author: 
id: B_366
internalId: 6da27e85-7e64-4ca3-ba18-56eea259e434
title: slow json list editor
status: ready
owner: 
affects:
agents:
  - design/activity/card__6da27e85-7e64-4ca3-ba18-56eea259e434.json
policy:
branch: b_366_slow_json_list_editor
worktree: 3
changedFiles:
  - app/json-array-performance.html
  - app/src/components/json_data_editor/json_array_editor.tsx
  - app/src/components/json_data_editor/json_array_scalar_editor.test.tsx
  - app/src/components/json_data_editor/json_array_scalar_editor.tsx
  - app/src/components/json_data_editor/json_array_scroll_seek_row.test.tsx
  - app/src/components/json_data_editor/json_array_scroll_seek_row.tsx
  - app/src/components/json_data_editor/json_data_editor.test.tsx
  - app/src/json_array_performance.tsx
---

check this trace: [Trace-scroll.json](file:///C:/Users/janbo/Documents/dev/Trace-scroll.json)

this is of a single scroll. the render takes very long. what is it doing? how can we improve?

## Current state

`JsonArrayEditor` uses `TableVirtuoso`. Its scroll handler updates Virtuoso's external store through `flushSync`; when the visible range changes, Virtuoso synchronously replaces the rendered row window. The trace contains one such range refresh after the recorded scroll. It is not caused by `JsonDataDocument`, file loading, or document change events.

The refresh creates 38 rows with 15 data columns: 608 table cells and 532 `JsonScalarEditor` instances. Virtualized body cells use MUI components such as `TableCell`, `TextField`, `Checkbox`, and `Link`. Mounting these components runs Emotion insertion effects. Two `StyleSheet._insertTag` calls consume about 825 ms of the 1.42-second refresh; React development instrumentation adds further overhead.

Continued scrolling repeats the row-window replacement whenever the visible range advances. Row memoization cannot prevent work for rows that Virtuoso unmounts and replaces.

## implementation details

* Configure `TableVirtuoso` with scroll-seek mode. Use named enter and exit velocity constants and render lightweight placeholder table rows while scrolling. Exit scroll-seek mode only after velocity falls below the exit threshold, then render the final visible range once.
* Add a dedicated scroll-seek row component. Render native `tr` and `td` elements, preserve the measured row height and full column span, and do not mount cell editors, selection controls, links, or MUI components in placeholders.
* Remove Emotion-backed components from the virtualized body-row hot path. Add array-specific body cells and a scalar editor using semantic native table and form elements. Apply table-body styling through stable classes whose theme-dependent rules are inserted once outside the virtualized rows. Keep the MUI header and footer because they are not replaced during scrolling.
* Preserve existing value handling. String and boolean edits still update `JsonDataDocument` immediately; number edits keep the existing draft, validation, blur, Enter, and Escape behavior; missing object fields still create the field; nested values still drill into the document.
* Keep the shared `JsonScalarEditor` unchanged for object and root-value editing. Do not add a behavior flag to it; the lightweight editor belongs to the array table only.
* Preserve column widths, horizontal overflow, selected-row highlighting, accessibility names, read-only behavior, and row operation ordering. Scrolling must not publish a `JsonDataDocument` change.
* Add focused tests for the array-specific scalar controls and placeholder row, and retain the existing array editing, virtualization, resizing, selection, nested-value, and read-only coverage. Verify the fix with a development performance trace and run the focused JSON editor tests and app lint.

## acceptance criteria

* Active fast scrolling renders lightweight placeholder rows instead of repeatedly mounting complete editable rows. The final visible rows become editable after scrolling settles.
* Repeated virtual-range changes do not add Emotion styles from body cells and do not produce recurring `StyleSheet._insertTag` blocks attributable to the JSON array body.
* Scrolling does not reload JSON data, publish document changes, change dirty state, selection, column widths, or the current JSON location.
* Strings, numbers, booleans, nulls, missing fields, and nested values retain their existing editing and navigation behavior in editable and read-only documents.
* Column resizing, header/body alignment, horizontal scrolling, row selection, and add, delete, copy, cut, and paste operations continue to work.
* Focused JSON editor tests and app lint pass.
