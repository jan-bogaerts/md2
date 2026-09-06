---
author: 
id: F_255
internalId: 9d5878e6-2d20-4574-971d-57dbd82eb389
title: make diagrams editable
status: ready
owner: 
affects:
agents:
  - design/activity/card__9d5878e6-2d20-4574-971d-57dbd82eb389.json
policy:
changedFiles:
  - design/feature_descriptions/F_276_add_diagram_mutation_operations.md
  - design/feature_descriptions/F_277_track_diagram_changes.md
  - design/feature_descriptions/F_278_make_diagram_layout_compatible_with_editing.md
  - design/feature_descriptions/F_279_validate_diagram_edit_operations.md
  - design/feature_descriptions/F_280_add_current_and_new_diagram_comparison.md
  - design/feature_descriptions/F_281_add_vertical_diagram_comparison.md
  - design/feature_descriptions/F_282_add_horizontal_diagram_comparison.md
  - design/feature_descriptions/F_283_add_tabbed_diagram_comparison.md
  - design/feature_descriptions/F_284_add_diagram_comparison_layout_selector.md
  - design/feature_descriptions/F_285_add_resizable_diagram_toolbox.md
  - design/feature_descriptions/F_286_manage_active_diagram_tool.md
  - design/feature_descriptions/F_287_add_diagram_zoom_in_tool.md
  - design/feature_descriptions/F_288_add_diagram_zoom_out_tool.md
  - design/feature_descriptions/F_289_add_diagram_coordinate_conversion.md
  - design/feature_descriptions/F_290_add_diagram_selection_service.md
  - design/feature_descriptions/F_291_add_direct_diagram_selection.md
  - design/feature_descriptions/F_292_add_additive_diagram_selection.md
  - design/feature_descriptions/F_293_add_rectangle_diagram_selection.md
  - design/feature_descriptions/F_294_move_selected_diagram_objects.md
  - design/feature_descriptions/F_295_resize_selected_diagram_objects.md
  - design/feature_descriptions/F_296_edit_diagram_object_details.md
  - design/feature_descriptions/F_297_add_diagram_delete_tool.md
  - design/feature_descriptions/F_298_add_diagram_delete_key_support.md
  - design/feature_descriptions/F_299_add_diagram_cut_tool.md
  - design/feature_descriptions/F_300_add_diagram_copy_tool.md
  - design/feature_descriptions/F_301_add_diagram_paste_tool.md
  - design/feature_descriptions/F_302_add_node_placement_infrastructure.md
  - design/feature_descriptions/F_303_add_component_node_tool.md
  - design/feature_descriptions/F_304_add_participant_node_tool.md
  - design/feature_descriptions/F_305_add_step_node_tool.md
  - design/feature_descriptions/F_306_add_decision_node_tool.md
  - design/feature_descriptions/F_307_add_start_node_tool.md
  - design/feature_descriptions/F_308_add_end_node_tool.md
  - design/feature_descriptions/F_309_add_state_node_tool.md
  - design/feature_descriptions/F_310_add_entity_node_tool.md
  - design/feature_descriptions/F_311_add_edge_drawing_infrastructure.md
  - design/feature_descriptions/F_312_add_architecture_edge_tools.md
  - design/feature_descriptions/F_313_add_dependency_edge_tools.md
  - design/feature_descriptions/F_314_add_sequence_edge_tools.md
  - design/feature_descriptions/F_315_add_flow_edge_tools.md
  - design/feature_descriptions/F_316_add_entity_relationship_edge_tool.md
  - design/feature_descriptions/F_317_add_diagram_group_tool.md
  - design/feature_descriptions/F_318_edit_diagram_group_membership.md
  - design/feature_descriptions/F_319_edit_sequence_fragments.md
  - design/feature_descriptions/F_320_edit_diagram_metadata.md
  - design/feature_descriptions/F_321_edit_diagram_legend.md
  - design/feature_descriptions/F_322_generate_diagram_change_descriptions.md
  - design/feature_descriptions/F_323_add_diagram_change_review.md
  - design/feature_descriptions/F_324_pass_diagram_changes_to_an_agent.md
  - design/feature_descriptions/F_325_handle_diagram_implementation_runs.md
  - design/feature_descriptions/F_326_integrate_diagram_editor.md
  - design/feature_descriptions/F_327_save_edited_diagram_as_copy.md
  - design/feature_descriptions/F_328_make_diagram_edit_updates_granular.md
after: 0a0fa053-2cfc-497e-9bb4-c3440ddb8638
---
This is the umbrella for making JSON diagrams editable. The work is split into the focused jobs below.

## Decisions

* The original diagram is immutable. Saving creates a new JSON diagram and a new diagram record. Later saves update that copy, never the original.
* Users draw edges between nodes. Endpoints attach through explicit connection points on the nodes.
* Groups are independently positioned and sized. Membership is edited separately from geometry.
* The toolbox `Others` section initially contains diagram metadata, legend, and sequence fragments only.
* Closely related edge kinds share one job where their interaction is the same.
* `DiagramData` is editable model data. Services keep its objects stable and assign only the field being changed; they never rebuild a node, edge, group, array, or complete diagram for a field edit.
* Derived view data is also service-owned and updated only where its dependency changed. A field edit must never run whole-diagram layout.
* Leaf components subscribe through `useSyncExternalStore` to the primitive field or stable reference they render. Collection components subscribe only to collection membership. Diagram roots and comparison/layout parents do not subscribe to complete diagram data.
* State notifications use granular, identity-scoped `EventTarget` events. A node field change cannot notify unrelated nodes, edges, groups, or the diagram root.

## Jobs

### Foundation

1. [F\_273 define the editable diagram contract](F_273_define_editable_diagram_contract.md)
2. [F\_274 add editable connection points](F_274_add_editable_connection_points.md)
3. [F\_275 add diagram edit session service](F_275_add_diagram_edit_session_service.md)
4. [F\_276 add diagram mutation operations](F_276_add_diagram_mutation_operations.md)
5. [F\_277 track diagram changes](F_277_track_diagram_changes.md)
6. [F\_278 make diagram layout compatible with editing](F_278_make_diagram_layout_compatible_with_editing.md)
7. [F\_279 validate diagram edit operations](F_279_validate_diagram_edit_operations.md)
8. [F\_329 make diagram edit updates granular](F_329_make_diagram_edit_updates_granular.md) corrects the already implemented F\_273–F\_275 foundation and is a prerequisite for jobs 4–55.

### Comparison UI

1. [F\_280 add current and new diagram comparison](F_280_add_current_and_new_diagram_comparison.md)
2. [F\_281 add vertical diagram comparison](F_281_add_vertical_diagram_comparison.md)
3. [F\_282 add horizontal diagram comparison](F_282_add_horizontal_diagram_comparison.md)
4. [F\_283 add tabbed diagram comparison](F_283_add_tabbed_diagram_comparison.md)
5. [F\_284 add diagram comparison layout selector](F_284_add_diagram_comparison_layout_selector.md)

### Toolbox and viewport

1. [F\_285 add resizable diagram toolbox](F_285_add_resizable_diagram_toolbox.md)
2. [F\_286 manage active diagram tool](F_286_manage_active_diagram_tool.md)
3. [F\_287 add diagram zoom in tool](F_287_add_diagram_zoom_in_tool.md)
4. [F\_288 add diagram zoom out tool](F_288_add_diagram_zoom_out_tool.md)
5. [F\_289 add diagram coordinate conversion](F_289_add_diagram_coordinate_conversion.md)

### Selection and transforms

1. [F\_290 add diagram selection service](F_290_add_diagram_selection_service.md)
2. [F\_291 add direct diagram selection](F_291_add_direct_diagram_selection.md)
3. [F\_292 add additive diagram selection](F_292_add_additive_diagram_selection.md)
4. [F\_293 add rectangle diagram selection](F_293_add_rectangle_diagram_selection.md)
5. [F\_294 move selected diagram objects](F_294_move_selected_diagram_objects.md)
6. [F\_295 resize selected diagram objects](F_295_resize_selected_diagram_objects.md)
7. [F\_296 edit diagram object details](F_296_edit_diagram_object_details.md)
8. [F\_297 add diagram delete tool](F_297_add_diagram_delete_tool.md)
9. [F\_298 add diagram Delete key support](F_298_add_diagram_delete_key_support.md)
10. [F\_299 add diagram cut tool](F_299_add_diagram_cut_tool.md)
11. [F\_300 add diagram copy tool](F_300_add_diagram_copy_tool.md)
12. [F\_301 add diagram paste tool](F_301_add_diagram_paste_tool.md)

### Node tools

1. [F\_302 add node placement infrastructure](F_302_add_node_placement_infrastructure.md)
2. [F\_303 add component node tool](F_303_add_component_node_tool.md)
3. [F\_304 add participant node tool](F_304_add_participant_node_tool.md)
4. [F\_305 add step node tool](F_305_add_step_node_tool.md)
5. [F\_306 add decision node tool](F_306_add_decision_node_tool.md)
6. [F\_307 add start node tool](F_307_add_start_node_tool.md)
7. [F\_308 add end node tool](F_308_add_end_node_tool.md)
8. [F\_309 add state node tool](F_309_add_state_node_tool.md)
9. [F\_310 add entity node tool](F_310_add_entity_node_tool.md)

### Edge tools

1. [F\_311 add edge drawing infrastructure](F_311_add_edge_drawing_infrastructure.md)
2. [F\_312 add architecture edge tools](F_312_add_architecture_edge_tools.md)
3. [F\_313 add dependency edge tools](F_313_add_dependency_edge_tools.md)
4. [F\_314 add sequence edge tools](F_314_add_sequence_edge_tools.md)
5. [F\_315 add flow edge tools](F_315_add_flow_edge_tools.md)
6. [F\_316 add entity relationship edge tool](F_316_add_entity_relationship_edge_tool.md)

### Groups and other content

1. [F\_317 add diagram group tool](F_317_add_diagram_group_tool.md)
2. [F\_318 edit diagram group membership](F_318_edit_diagram_group_membership.md)
3. [F\_319 edit sequence fragments](F_319_edit_sequence_fragments.md)
4. [F\_320 edit diagram metadata](F_320_edit_diagram_metadata.md)
5. [F\_321 edit diagram legend](F_321_edit_diagram_legend.md)

### Change delivery and saving

1. [F\_322 generate diagram change descriptions](F_322_generate_diagram_change_descriptions.md)
2. [F\_323 add diagram change review](F_323_add_diagram_change_review.md)
3. [F\_324 pass diagram changes to an agent](F_324_pass_diagram_changes_to_an_agent.md)
4. [F\_325 handle diagram implementation runs](F_325_handle_diagram_implementation_runs.md)
5. [F\_326 integrate the diagram editor](F_326_integrate_diagram_editor.md)
6. [F\_327 save edited diagram as a copy](F_327_save_edited_diagram_as_copy.md)

## Completion

F\_255 is complete when all jobs above meet their acceptance criteria. Each job must preserve diagram viewing, breadcrumb navigation, drill-down actions, and all diagram types outside its stated scope.