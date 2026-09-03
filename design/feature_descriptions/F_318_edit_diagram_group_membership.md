---
author:
id: F_318
internalId: 20805ee5-a17a-4a7d-803c-23e91bfae174
title: edit diagram group membership
status: new
owner:
affects:
agents:
policy:
after: 587b42de-3d65-4665-9cb8-b714397a6964
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Edit group membership independently from group geometry.

## Scope

The group details editor lists nodes in the active diagram and allows adding or removing members. Membership changes only nodeIds; they do not reposition nodes or resize the group.

## Acceptance criteria

* Every member ID references an existing node and appears at most once.
* Empty groups remain valid.
* Removing a node from the diagram removes its group references.
* Membership edits create semantic changes distinct from group move and resize changes.
* Nested groups are not introduced.

## State and rendering rule

Membership is a service-owned group field with identity-scoped updates. Add or remove only the requested node ID in place and update the stable membership view for that group. Do not replace the group, node, group collection, or diagram; only the group-membership leaf rerenders.

## Dependencies

[F_317](F_317_add_diagram_group_tool.md) and [F_296](F_296_edit_diagram_object_details.md).
