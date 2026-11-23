---
author: 
id: F_449
internalId: 41d340e6-afae-44bd-82e7-41ab673c94e0
title: config dialog for diagram items
status: ready
owner: 
affects:
agents:
  - design/activity/card__41d340e6-afae-44bd-82e7-41ab673c94e0.json
policy:
after: 5221030b-ed7e-4860-bd8f-177274dc9a02
changedFiles:
  - app/src/components/diagram_view/details/diagram_node_details_editor.tsx
  - app/src/components/diagram_view/details/diagram_object_details_dialog.test.tsx
---

The configuration dialog uses a **Role** dropdown. It should contain the legend items instead of the internal role definitions.

## Current state

The node details editor exposes the internal diagram roles, such as `focal`, `backend`, and `store`, in the **Role** dropdown. It also exposes the user-facing node legend items in a separate **Legend entry** dropdown. Both controls edit the same node classification.

The diagram model requires both `role` and `legendEntryId`. The existing legend-entry change handler already derives the compatible internal role or node kind and saves the complete classification through `setNodeClassification`.

## Implementation details

Replace the internal-role options in the **Role** dropdown with the node legend entries from `DiagramData.meta.legend`. Display each entry's label and use its `id` as the selected value.

When the user selects an entry, reuse the existing legend-entry change behavior to update `legendEntryId` and derive the compatible internal `role` or node `kind`. Keep the internal fields in the model, but do not expose their raw values in this dropdown. Remove the separate **Legend entry** dropdown because it would duplicate the same choice.

Keep the existing **Kind** control for flow diagrams and the existing atomic `setNodeClassification` save operation. Do not change edge configuration as part of this feature.

## Acceptance criteria

* The node configuration dialog's **Role** dropdown lists the user-facing labels of the diagram's node legend entries.
* Raw internal role values are not presented as dropdown options.
* The separate **Legend entry** dropdown is removed.
* Selecting a role-based legend entry updates both `legendEntryId` and `role`.
* Selecting a node-kind legend entry updates `legendEntryId` and the compatible node kind while preserving the node's role.
* Saving applies the classification as one operation, and cancelling leaves the node unchanged.
* Tests cover custom legend labels, role-based entries, node-kind entries, saving, and cancellation.
