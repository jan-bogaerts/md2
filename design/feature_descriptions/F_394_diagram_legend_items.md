---
author: 
id: F_394
internalId: de670664-aeae-4814-bf3f-4bb280bd85a9
title: Diagram legend items
status: ready
owner: 
affects:
agents:
  - design/activity/card__de670664-aeae-4814-bf3f-4bb280bd85a9.json
policy:
after: 28d05421-63b6-4bda-9701-5bdbd2e81e70
changedFiles:
  - app/src/components/diagram_view/creation_tools/diagram_creation_tools.ts
  - app/src/components/diagram_view/legend/diagram_legend.test.tsx
  - app/src/components/diagram_view/legend/diagram_legend_details_editor.test.tsx
  - app/src/components/diagram_view/legend/diagram_legend_details_editor.tsx
  - app/src/components/diagram_view/legend/diagram_legend_entries.node.test.ts
  - app/src/components/diagram_view/legend/diagram_legend_entries.ts
  - app/src/components/diagram_view/legend/diagram_legend_entry_editor.tsx
  - app/src/components/diagram_view/legend/diagram_legend_entry_list.tsx
  - app/src/components/diagram_view/legend/diagram_legend_entry_row.tsx
  - app/src/components/diagram_view/legend/diagram_session_legend_entries.test.tsx
  - app/src/components/diagram_view/legend/diagram_session_legend_entries.tsx
  - app/src/services/diagrams/diagram_change_descriptions.node.test.ts
  - app/src/services/diagrams/diagram_change_descriptions.ts
  - app/src/services/diagrams/diagram_creation_tool_labels.ts
  - app/src/services/diagrams/diagram_data.node.test.ts
  - app/src/services/diagrams/diagram_derived_legend.ts
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_edit_types.ts
  - app/src/services/diagrams/diagram_edit_validation.ts
  - app/src/services/diagrams/diagram_legend_entry_key.ts
  - shared/diagram_data.d.mts
  - shared/diagram_data.mjs
---

For diagrams, We auto generate legend items, also when editing. I have the impression that we use the ´type´ as label for the legend items and this can differ with the labels used by the ´add tool´ when editing. This is confusing. We should use same label for the auto generated items as are used in the add-tool.

## Current state

When `meta.legend` is absent, Current and New legends derive one node entry per **role** (`focal`, `store`, etc.) and one connection entry per edge kind. They show those raw values as labels. The Add tool instead names node **kinds** (`Component`, `Start`, `End`, `Step`, etc.) and connection kinds (`Data`, `Async`, etc.) through `diagramCreationTools`. Several node kinds share a role, so a role entry cannot name each Add tool. An explicit `meta.legend` replaces derivation and keeps its saved labels. Editing a derived label first stores all derived entries as an explicit legend. Node formatting is keyed by role; connection formatting is keyed by edge kind.

## Implementation details

* **Terms.** Node *kind* selects an Add tool and node shape; node *role* selects formatting. A *derived entry* is generated from diagram objects only while `meta.legend` is absent. Use one derived node entry per distinct node kind and one derived connection entry per distinct edge kind, in first-appearance order within each group. Exclude groups and fragments, as today.
* Use Add tool labels as the single source for derived labels in both Current and New legends. Resolve optional node kinds for architecture, dependency, entity, and sequence diagrams using their existing diagram-type defaults. Include both Root and Topic for mindmaps regardless of which Add tool is currently available. Do not use an object's own label as its legend label.
* Give node-kind legend entries a distinct `nodeKind` field and stable key, separate from existing role entries and connection-kind entries. Extend `DiagramLegendEntryData`, parser/serializer validation, edit operations, selection, scoped subscriptions, and change descriptions to recognize it. Keep existing explicit role entries and their labels valid and unchanged; keep explicit connection labels and order unchanged. Renaming or removing a derived entry must materialize kind-based entries, without merging different kinds that share a role.
* Keep formatting storage and rendering keyed by node role. An explicit role entry formats its role as today. A node-kind row formats the sole used role directly; when that kind has multiple used roles, let the user choose the role before opening its existing formatting controls. A kind with no used nodes has no role to format. Connection rows keep their current formatting behavior. Update the legend editor's add choices and row descriptions for node kinds while retaining support for existing role entries.
* Cover derivation, explicit legends, optional node kinds, multiple kinds sharing a role, multiple roles sharing a kind, mindmap Root/Topic, label editing, save/reload, and Current/New updates with focused tests. Keep updates scoped to affected legend entries and object fields.

## Acceptance criteria

1. With no explicit legend, each used node kind appears once and each used connection kind appears once. Labels exactly match their Add tool labels, including capitalization; Start, End, Step, and Decision remain separate even when all have role `focal`.
2. Current and New legends show the same labels for the same diagram objects. Adding, removing, or changing a node kind or edge kind updates New legend immediately; Current continues to describe saved diagram until save.
3. Existing explicit legends retain saved labels, order, and role-based entries after load and save. Editing a derived label saves kind-based entries; reopening saved diagram preserves each custom label and does not combine kinds sharing a role.
4. Formatting a node-kind entry changes only the selected node role. When multiple roles use that kind, user can choose which role to format. Existing role and connection formatting still work.
5. Diagrams with omitted node kinds use their diagram-type default for legend identity and label. Mindmap Root and Topic labels resolve even when only one is currently offered by Add tool. No diagram geometry or node/edge identity changes.
