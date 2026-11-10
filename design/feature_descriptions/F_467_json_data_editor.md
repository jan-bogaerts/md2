---
author: 
id: F_467
internalId: d5f63dfb-c3f3-41f4-b300-0db72fc93f21
title: json data editor
status: ready
owner: 
affects:
agents:
  - design/activity/card__d5f63dfb-c3f3-41f4-b300-0db72fc93f21.json
policy:
branch: f_467_json_data_editor
worktree: 2
changedFiles:
  - app/src/components/editor/file_search/markdown_file_search_selection.ts
  - app/src/components/editor/links/markdown_link_node.ts
  - app/src/components/editor/links/markdown_link_realm_plugin.ts
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/editor/markdown_editor_json_link.real.test.tsx
  - app/src/components/editor/placeholders/markdown_placeholder_toolbar_control.grouped.test.tsx
  - app/src/components/editor/references/markdown_reference_realm_plugin.ts
  - app/src/components/json_data_editor/json_array_editor.tsx
  - app/src/components/json_data_editor/json_breadcrumbs.tsx
  - app/src/components/json_data_editor/json_data_editor.test.tsx
  - app/src/components/json_data_editor/json_data_editor.tsx
  - app/src/components/json_data_editor/json_data_popup.tsx
  - app/src/components/json_data_editor/json_object_editor.tsx
  - app/src/components/json_data_editor/json_scalar_editor.tsx
  - app/src/components/project_workspace.tsx
  - app/src/components/text_view/json_editor_pane.tsx
  - app/src/components/text_view/json_text_view_integration.test.tsx
  - app/src/components/text_view/tab_bar.tsx
  - app/src/components/text_view/text_editor_pane.tsx
  - app/src/services/application_startup_service.ts
  - app/src/services/card_popup_service.test.ts
  - app/src/services/card_popup_service.ts
  - app/src/services/clipboard_text.ts
  - app/src/services/data/data_service.ts
  - app/src/services/json/json_data_document.node.test.ts
  - app/src/services/json/json_data_document.ts
  - app/src/services/json/json_data_service.node.test.ts
  - app/src/services/json/json_data_service.ts
  - app/src/services/json/json_link_navigation.test.ts
  - app/src/services/json/json_link_navigation.ts
  - app/src/services/json/json_link_path.node.test.ts
  - app/src/services/json/json_link_path.ts
  - app/src/services/json/json_types.ts
  - app/src/services/open_document.ts
  - app/src/services/open_files_service.node.test.ts
  - app/src/services/open_files_service.ts
  - app/src/services/project/project_persistence_service.node.test.ts
  - app/src/services/project/project_persistence_service.ts
---
We need to add support for a json data editor, similar like we have the markdown editor.

* This should be a stand alone component
* when the user clicks on a link that is a json file, the editor should be opened
  * when in card-view, this should be a popup, similar like the card or action popups, so managed by the [card_popup_service.ts](app/src/services/card_popup_service.ts)
  * when in list view, this should be a new tab with a data editor
* for an array, show a table, the columns are the field names of the objects inside the array, if the array has primitives, there is only 1 column, 'values'&#x9;
  * user can add & delete, copy, cut, paste records.
  * user can select multiple records for copy, cut or delete
  * fields allow for inline editing
* for objects, show a form, with fields layout out vertically
* if a field value is a list or object, show a button to dig into the value. this is for objects and for lists.&#x20;
  * at the top of the data editor is a breadcrumb component that displays the path into the data.
    * user can click on items to go back

## Current state

`MarkdownEditor` renders repository links, but no application route opens project JSON data. List-view tabs support only cards, actions, and agent instruction Markdown. Repository JSON paths may appear in the file-tree folder structure, but arbitrary JSON files are not open documents and cannot be edited there.

`CardPopupService` owns action, card-details, and card-sequence popups. It has no JSON popup entry. Existing storage bridges can list repository paths, load a text file, and write files, but `ProjectPersistenceService` saves only open card, action, and instruction drafts.

## implementation details

* Add a standalone `JsonDataEditor` component. A JSON document service owns loaded data, draft changes, dirty state, and the current nested location; components subscribe with `useSyncExternalStore` and only render or invoke service operations.
* Intercept clicks on project-local links whose path ends in `.json`, resolving relative paths from the Markdown document containing the link. Keep HTTP, HTTPS, anchor, non-JSON, and paths outside the active project on their current link path.
* In card view, add a `json-data` entry to `CardPopupService` and render the editor in the shared popup stack. In list view, extend `OpenFilesService`, `TabBar`, `TextEditorPane`, and project persistence with a JSON document kind so one tab exists per resolved project-relative path.
* Load JSON through the active storage text-file API. Parse before exposing editable data. Show malformed, missing, and unreadable-file errors through `dialogService`; do not create or mutate editor state during render.
* Save valid JSON through the existing project persistence flow, using stable pretty-printed JSON and a final newline. Read-only projects render data but disable every mutation. If storage reports an external change while the document is dirty, keep the draft and warn instead of overwriting it.
* Render an object as vertically stacked property-name/value rows. Strings, numbers, booleans, and `null` use type-preserving inline controls; property names are not editable in this feature. A root primitive uses the same single-value control.
* Render an array containing only objects as a table whose columns are the union of object field names in first-seen order. Render every other array, including empty and mixed-type arrays, with one `values` column. Missing object fields display an empty cell and remain missing until edited.
* Array selection supports one or many rows. Add inserts an empty object for an object table and `null` for a `values` table. Delete removes selected rows. Copy writes selected values, in row order, as a JSON array. Cut removes rows only after clipboard writing succeeds. Paste accepts a JSON array and inserts its values after the last selected row, or at the end when nothing is selected; invalid clipboard JSON leaves data unchanged and shows an error.
* Replace nested object or array values with a drill-in button. Breadcrumb starts at the file root and adds one item for each property name or array index traversed. Clicking an ancestor item returns to that exact value; edits that remove the current value return the editor to its closest existing ancestor.
* Add focused service and component tests for link routing by workspace view, popup/tab reuse, loading and save failures, object and array layouts, mixed and empty arrays, scalar editing, row operations, clipboard failure, breadcrumbs, read-only behavior, and dirty external changes.

## acceptance criteria

* Clicking a project-local `.json` link in card view opens one managed JSON popup anchored to the clicked link; clicking the same link again activates the existing popup.
* Clicking a project-local `.json` link in list view opens or activates one JSON tab for that resolved path.
* External, anchor, and non-JSON links retain current behavior. Missing, unreadable, or malformed JSON shows a clear error and does not open an editable document.
* Objects display vertical fields. Object-only arrays display a table with the union of their field names. Primitive, mixed, and empty arrays display one `values` column. Root primitive values remain editable.
* Nested objects and arrays open through a drill-in control. Breadcrumb shows each traversed property or index and lets user return to any ancestor.
* User can edit scalar values without changing their JSON type. Array add, multi-row selection, delete, copy, cut, and paste preserve row order and produce valid JSON.
* Invalid edits or clipboard content never change draft data. Failed clipboard writes never remove cut rows.
* Saving writes stable pretty-printed JSON through existing project persistence. Read-only projects cannot change data, and dirty drafts are not overwritten by external file changes.
* JSON popup and tab state survives unrelated React rerenders and closes through existing popup and tab controls.
