---
author: 
id: F_452
internalId: a18b2880-10c9-4ded-b45c-29113f160478
title: diagrams add format painter tool
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__a18b2880-10c9-4ded-b45c-29113f160478.json
policy:
after: 733d678c-49a7-4409-9fa2-5fb384821513
branch: f_452_diagrams_add_format_painter_tool
worktree: 1
---

* available when something on the diagram has been copied.
* applies the formatting of the item in the copy buffer to the item(s) that is/are currently selected

## Current state

Nodes and connections have `legendEntryId`. Their appearance resolves from `formatting.legendEntries[legendEntryId]`, then falls back to node-role or connection-kind formatting. Nodes also have `role` and optional `kind`; connections have `kind`. Labels are required on nodes and optional on connections.

Copy writes a versioned diagram fragment to the system clipboard, but keeps no observable in-app copy source. A normal fragment requires nodes; a connection selected without its endpoint nodes cannot currently be copied. Rectangle selection includes nodes, groups, and any connection route intersecting the rectangle. Selection may therefore contain mixed object kinds.

`DiagramEditSessionService` already exposes validated node and connection classification operations. Classification means the fields that determine semantic type and legend compatibility: node `role`, node or connection `kind`, and `legendEntryId`. These operations preserve object identity, record semantic changes, and publish granular field events.

## implementation details

* Add an `EventTarget`-based format-paste service owning the last eligible source captured by an in-app Copy action and the open dialog state. Store an immutable source snapshot, not a path or live object reference. Snapshot one node or one connection plus its legend entry and legend formatting. A later successful multi-object or group copy clears the eligible source; a failed Copy leaves the previous successful source unchanged. Cut does not replace this source.
* Keep normal node Copy behavior: update format source only after fragment serialization and system-clipboard write succeed. Treat copying one connection by itself as a format-only success: capture that connection as format source without changing system clipboard content. Do not broaden shared fragment construction or Cut behavior; `buildDiagramFragmentClipboardPayload` is used by both Copy and Cut, and Cut must keep its existing deletion and clipboard rules.
* Add a Format Paste action beside clipboard commands. Enable it only during an edit session when a source exists and current selection contains at least one target of the same object kind. Node source affects selected nodes only; connection source affects selected connections only. Ignore groups and the opposite object kind. Disable action when no compatible target exists.
* Opening action shows a dialog with checkboxes for `Legend`, `Kind` when source has `kind`, and `Label` when source has a label. No values change until user confirms. Cancel closes dialog without mutation. Require at least one checked option before Apply.
* `Legend` copies source legend relationship. Reuse an equivalent target legend entry; otherwise add source entry with a collision-free target ID. Also copy classification required by that entry: node `role` for role entries, node `kind` for node-kind entries, or connection `kind` for connection entries. Copy source legend-entry formatting to newly added entry; when reusing an equivalent entry, keep target entry's existing formatting.
* `Kind` copies source `kind`. When `Legend` is not checked, retain target legend entry if compatible; otherwise select an existing compatible target entry. If none exists, reject Apply with a clear dialog error and make no changes. `Label` copies exact source label value to every compatible selected target.
* Validate every target and legend change before mutation. Apply all selected fields as one batch edit so one invalid target cannot leave partial changes. Keep node and connection IDs, geometry, endpoints, group membership, and unselected objects unchanged. Record normal semantic changes and dispatch existing field- and legend-membership events only for changed values.
* Keep format source available after Apply for repeated use. Clear only dialog state when edit session ends; keep copied source across diagram navigation because it is an immutable in-app copy snapshot. Cross-diagram Apply must still pass target diagram type, preset, node-root, edge-label, and legend compatibility validation.
* Build dialog with existing MUI dialog conventions: labelled checkboxes, Cancel and Apply at bottom right, keyboard access, theme tokens, and errors through `dialogService`.
* Add focused tests for source capture and clearing, clipboard failure, connection-only format capture leaving system clipboard unchanged, mixed selections, node/connection restriction, checkbox combinations, required classification, legend reuse/import and ID collision, batch rollback, granular events, repeated Apply, cross-diagram validation, dialog keyboard flow, and disabled states. Run related app tests and app lint during implementation.

## acceptance criteria

* After a successful in-app Copy of exactly one node, Format Paste uses an immutable snapshot of that node. After Copy of exactly one connection, Format Paste uses that connection and leaves system clipboard content unchanged. Failed Copy retains previous successful format source.
* Successful Copy containing multiple objects or only a group makes Format Paste unavailable. Cut does not change Format Paste source.
* Format Paste is enabled only with an active edit session, an eligible source, and at least one selected target of matching object kind. Node source changes selected nodes only; connection source changes selected connections only. Groups, opposite object kind, unselected nodes, and unselected connections remain unchanged.
* Dialog offers Legend, Kind when available, and Label when present. Apply requires at least one option. Cancel changes nothing.
* Legend copies source legend relationship and required node role, node kind, or connection kind. Equivalent target entry is reused; missing entry is added with collision-free ID and source formatting. Reused entry keeps target formatting.
* Kind copies source kind while maintaining a compatible target legend reference. Missing compatible target entry causes visible error and zero mutation. Label copies exact source label value.
* One Apply validates all targets before mutation, then records one batch of normal semantic changes. Any validation failure leaves diagram, selection, dirty state, and change registry unchanged.
* Object IDs, connection endpoints, geometry, group membership, system clipboard content, and normal Paste behavior remain unchanged by Format Paste.
* Applied changes render immediately through existing granular subscriptions, persist through normal diagram save flow, and remain available for semantic change review.
* Dialog is keyboard-operable, uses app theme, places actions bottom right, and reports failures through `dialogService`.
