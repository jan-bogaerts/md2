---
id: F_379
internalId: 2ac96102-aba9-4901-a7f3-fcbd78b6b7fc
status: new
title: Move diagram field edits into focused editors
after: 11011a61-0393-4aa1-9b89-f52be576aa72
---

# Move diagram field edits into focused editors

## Current state

`DiagramEditSessionService` directly implements formatting, metadata, legend, node, edge, group, fragment, and entity-field edits. Each operation validates a candidate, changes the canonical object, updates the semantic change registry, and publishes scoped events. Multi-field edits such as node resizing, edge reconnection, and fragment updates must remain atomic.

## Work

* Move related operations into separate session-owned editor classes, with one class per file. Use focused APIs for formatting, legend, object fields, fragments, and entity fields. Each editor receives the internal edit context and works on the same canonical diagram; it must not own a duplicate model.
* Move the full behavior of each operation, including validation, mutation, change tracking, and its transaction details. Existing preparation modules for edge reconnection and fragment updates remain available where useful. Keep multi-field edits as one transaction.
* Migrate callers in diagram details, inline editors, formatting controls, move and resize services, and their tests to the editor APIs. Remove the old session methods and their private helpers once all callers have moved. Do not leave one-line session forwarding methods.
* Preserve object references on ordinary field edits, the original-versus-editable distinction, scoped notification order, and the current return values and validation errors.

## Verification

* Focused tests cover representative edits from each editor, a reverted field change, invalid edits without mutation, node width and height as one transaction, edge endpoint and attachment consistency, fragment membership and order, and entity-field indexing.
* Run affected service and component tests, typecheck, and app lint. Record the net session-file reduction.

