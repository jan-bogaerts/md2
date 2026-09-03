---
author: 
id: F_255
internalId: 9d5878e6-2d20-4574-971d-57dbd82eb389
title: make diagrams editable
status: design
owner: 
affects:
agents:
  - design/activity/card__9d5878e6-2d20-4574-971d-57dbd82eb389.json
policy:
---
This is the umbrella for making JSON diagrams editable. The work is split into the focused jobs below.

## Decisions

* The original diagram is immutable. Saving creates a new JSON diagram and a new diagram record. Later saves update that copy, never the original.
* Users draw edges between nodes. Endpoints attach through explicit connection points on the nodes.
* Groups are independently positioned and sized. Membership is edited separately from geometry.
* The toolbox `Others` section initially contains diagram metadata, legend, and sequence fragments only.
* Closely related edge kinds share one job where their interaction is the same.
* `DiagramData` is editable model data. `PositionedDiagramData` remains derived rendering data and must not become a second source of truth.

## Jobs

### Foundation

1. [F_273 define the editable diagram contract](F_273_define_editable_diagram_contract.md)
2. [F_274 add editable connection points](F_274_add_editable_connection_points.md)
3. [F_275 add diagram edit session service](F_275_add_diagram_edit_session_service.md)
4. [F_276 add diagram mutation operations](F_276_add_diagram_mutation_operations.md)
5. [F_277 track diagram changes](F_277_track_diagram_changes.md)
6. [F_278 make diagram layout compatible with editing](F_278_make_diagram_layout_compatible_with_editing.md)
7. [F_279 validate diagram edit operations](F_279_validate_diagram_edit_operations.md)

### Comparison UI

8. [F_280 add current and new diagram comparison](F_280_add_current_and_new_diagram_comparison.md)
9. [F_281 add vertical diagram comparison](F_281_add_vertical_diagram_comparison.md)
10. [F_282 add horizontal diagram comparison](F_282_add_horizontal_diagram_comparison.md)
11. [F_283 add tabbed diagram comparison](F_283_add_tabbed_diagram_comparison.md)
12. [F_284 add diagram comparison layout selector](F_284_add_diagram_comparison_layout_selector.md)

### Toolbox and viewport

13. [F_285 add resizable diagram toolbox](F_285_add_resizable_diagram_toolbox.md)
14. [F_286 manage active diagram tool](F_286_manage_active_diagram_tool.md)
15. [F_287 add diagram zoom in tool](F_287_add_diagram_zoom_in_tool.md)
16. [F_288 add diagram zoom out tool](F_288_add_diagram_zoom_out_tool.md)
17. [F_289 add diagram coordinate conversion](F_289_add_diagram_coordinate_conversion.md)

### Selection and transforms

18. [F_290 add diagram selection service](F_290_add_diagram_selection_service.md)
19. [F_291 add direct diagram selection](F_291_add_direct_diagram_selection.md)
20. [F_292 add additive diagram selection](F_292_add_additive_diagram_selection.md)
21. [F_293 add rectangle diagram selection](F_293_add_rectangle_diagram_selection.md)
22. [F_294 move selected diagram objects](F_294_move_selected_diagram_objects.md)
23. [F_295 resize selected diagram objects](F_295_resize_selected_diagram_objects.md)
24. [F_296 edit diagram object details](F_296_edit_diagram_object_details.md)
25. [F_297 add diagram delete tool](F_297_add_diagram_delete_tool.md)
26. [F_298 add diagram Delete key support](F_298_add_diagram_delete_key_support.md)
27. [F_299 add diagram cut tool](F_299_add_diagram_cut_tool.md)
28. [F_300 add diagram copy tool](F_300_add_diagram_copy_tool.md)
29. [F_301 add diagram paste tool](F_301_add_diagram_paste_tool.md)

### Node tools

30. [F_302 add node placement infrastructure](F_302_add_node_placement_infrastructure.md)
31. [F_303 add component node tool](F_303_add_component_node_tool.md)
32. [F_304 add participant node tool](F_304_add_participant_node_tool.md)
33. [F_305 add step node tool](F_305_add_step_node_tool.md)
34. [F_306 add decision node tool](F_306_add_decision_node_tool.md)
35. [F_307 add start node tool](F_307_add_start_node_tool.md)
36. [F_308 add end node tool](F_308_add_end_node_tool.md)
37. [F_309 add state node tool](F_309_add_state_node_tool.md)
38. [F_310 add entity node tool](F_310_add_entity_node_tool.md)

### Edge tools

39. [F_311 add edge drawing infrastructure](F_311_add_edge_drawing_infrastructure.md)
40. [F_312 add architecture edge tools](F_312_add_architecture_edge_tools.md)
41. [F_313 add dependency edge tools](F_313_add_dependency_edge_tools.md)
42. [F_314 add sequence edge tools](F_314_add_sequence_edge_tools.md)
43. [F_315 add flow edge tools](F_315_add_flow_edge_tools.md)
44. [F_316 add entity relationship edge tool](F_316_add_entity_relationship_edge_tool.md)

### Groups and other content

45. [F_317 add diagram group tool](F_317_add_diagram_group_tool.md)
46. [F_318 edit diagram group membership](F_318_edit_diagram_group_membership.md)
47. [F_319 edit sequence fragments](F_319_edit_sequence_fragments.md)
48. [F_320 edit diagram metadata](F_320_edit_diagram_metadata.md)
49. [F_321 edit diagram legend](F_321_edit_diagram_legend.md)

### Change delivery and saving

50. [F_322 generate diagram change descriptions](F_322_generate_diagram_change_descriptions.md)
51. [F_323 add diagram change review](F_323_add_diagram_change_review.md)
52. [F_324 pass diagram changes to an agent](F_324_pass_diagram_changes_to_an_agent.md)
53. [F_325 handle diagram implementation runs](F_325_handle_diagram_implementation_runs.md)
54. [F_326 integrate the diagram editor](F_326_integrate_diagram_editor.md)
55. [F_327 save edited diagram as a copy](F_327_save_edited_diagram_as_copy.md)

## Completion

F_255 is complete when all jobs above meet their acceptance criteria. Each job must preserve diagram viewing, breadcrumb navigation, drill-down actions, and all diagram types outside its stated scope.
