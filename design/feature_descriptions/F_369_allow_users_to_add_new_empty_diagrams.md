---
author: 
id: F_369
internalId: 522e73f4-0c67-4c35-8ce2-f6a570562479
title: allow users to add new empty diagrams
status: ready
owner: 
affects:
agents:
  - design/activity/card__522e73f4-0c67-4c35-8ce2-f6a570562479.json
policy:
after: 530bdc1a-985f-434a-bfe7-acb2f7ca06b8
branch: f_369_allow_users_to_add_new_empty_diagrams
worktree: 1
changedFiles:
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/shell/menu/app_menu.tsx
  - app/src/components/shell/menu/menu_components_no_mock.test.tsx
  - app/src/components/shell/menu/mobile_create_menu.grouped.test.tsx
  - app/src/components/shell/menu/mobile_create_menu.tsx
  - app/src/components/shell/menu/new_diagram_menu.test.tsx
  - app/src/components/shell/menu/new_diagram_menu.tsx
  - app/src/services/diagrams/diagram_data.node.test.ts
  - app/src/services/diagrams/diagram_index.ts
  - app/src/services/diagrams/diagram_view_service.test.ts
  - app/src/services/diagrams/diagram_view_service.ts
  - app/src/services/diagrams/empty_diagram_factory.test.ts
  - app/src/services/diagrams/empty_diagram_factory.ts
  - shared/diagram_data.mjs
---
users should be able to create new empty diagrams like cards and actions.

We currently have 2 buttons on the appbar: new card, new action. we need to add `new diagram`

This adds a new diagram, switches the view to diagrams if not already there and puts it in edit mode, no section needed for read-only versions.

The new diagram button opens a context menu containing all the supported diagram types. Each context menu item creates its respective diagram type.

Do not prefill the legend. Give the diagram a type-specific title, for example `New sequence`.

## Current state

`AppMenu` shows `New action` and `New card` on the desktop Home app bar. `MobileCreateMenu` exposes the same actions from its Create menu. Neither surface can create a diagram directly.

`DiagramViewService` owns the loaded diagram index, active path, source diagram and persistence. New records currently enter the index only after an agent action completes; every `DiagramRecord` therefore has an `actionId`, and root records are grouped by that value. `DiagramEditSessionService.start()` can edit only the active persisted source diagram. Saving an edit creates a copy, so it is not a creation path for a new empty source.

Valid diagram JSON requires non-empty `meta.title` and `meta.description`, a supported `meta.type`, version `1`, plus `nodes`, `edges` and `groups` arrays. Flow diagrams additionally require either the `flowchart` or `state` preset. Empty arrays are valid. A missing legend is valid and renders no entries until objects provide roles or connection kinds.

Current `DIAGRAM_TYPES` are architecture, dependency, sequence, flow and entity. [F\_368](F_368_add_mindmaps_to_diagrams.md), which precedes this feature, adds mindmap. Creation choices after that work are Architecture, Dependency, Sequence, Flowchart, State diagram, Entity and Mindmap. Flowchart and State diagram are separate choices because both use stored type `flow` but enable different node and edge rules.

## implementation details

* Add a focused empty-diagram factory beside the diagram data services. Give each choice one label, stored type and optional preset. Build canonical `DiagramData` with empty `nodes`, `edges` and `groups`, and omit optional `fragments` and `meta.legend`. Use `New <type>` for both record label and title, and a non-empty matching description such as `New sequence diagram`.
* Add one reserved root-group key, `user-created`, for manually created diagrams. Store it in `DiagramRecord.actionId` so the existing index shape, copy placement and validation remain unchanged; define a named constant and treat it as a grouping key, not a configured action. Agent-created records continue using their real action ID.
* Add `DiagramViewService.createEmptyDiagram` as the single persistence operation. It must require a bound, ready, writable project; create a UUID record and collision-free `.json` path inside `config.diagramsFolder`; validate and serialize the new data; add the record as a root under `user-created`; make that record the sole active path; queue diagram JSON and updated `diagram-view.json` in the same commit batch; and flush before publishing the new index, positioned diagram and source snapshot. A failure must leave in-memory diagram state unchanged and reach `dialogService` through the app-menu handler.
* After persistence succeeds, set `WorkspaceViewService` to `diagrams`, start `DiagramEditSessionService` from the new active source, and focus the editable surface. Starting from a persisted source preserves the current edit-session and save-copy contracts. If another edit session is dirty, refuse creation before writing files and show a warning; clean sessions may be replaced.
* Add a `New diagram` desktop button beside `New action` and `New card`. Its anchored MUI menu contains Architecture, Dependency, Sequence, Flowchart, State diagram, Entity and Mindmap. Selecting an item closes the menu and runs the complete create, navigate and edit sequence. Disable the control when no project is open, the project is read-only, or creation is already running. No extra control belongs in the Diagram tab's read-only section.
* Add `New diagram` to `MobileCreateMenu`; selecting it opens the same type choices and calls the same creation operation. Keep menu anchor/open state in the menu component rather than application model state.
* Add factory tests for every choice, including both flow presets, required metadata, empty collections, omitted legend and parser acceptance. Add `DiagramViewService` tests for record/path creation, the reserved root group, active-path replacement, one batched diagram/index flush, collisions and failed persistence. Add app-menu tests for desktop and mobile menus, disabled/read-only state, view switching, edit-session start, dirty-session refusal and error reporting.

## acceptance criteria

* Writable open projects show `New diagram` beside the desktop creation buttons and in the mobile Create menu. Closed or read-only projects cannot use it.
* The type menu lists Architecture, Dependency, Sequence, Flowchart, State diagram, Entity and Mindmap. Flowchart stores `{ type: "flow", preset: "flowchart" }`; State diagram stores `{ type: "flow", preset: "state" }`.
* Selecting a type immediately writes valid diagram JSON and an updated diagram index. The new record is a root in the reserved `user-created` group, has a unique ID/path, and becomes the active path.
* New diagram data has a type-specific `New ...` title, a non-empty description, and empty object collections. It contains no prefilled legend.
* After both files persist, the workspace shows Diagrams view and the new diagram is in edit mode with the editable surface focused, whether creation started from cards, text, stats or diagrams view.
* Persistence failure does not publish the record, switch the active diagram or start editing; the user sees an error. A dirty existing edit session blocks creation before any file is written.
* Existing agent-created diagrams, child navigation, edited-copy saving and index files remain compatible.
* Focused diagram-service and app-menu tests, app type checking and `npm run lint` pass.
