# Extract diagram edit snapshots and subscriptions

## Current state

The first roughly 250 lines of DiagramEditSessionService expose snapshots and scoped subscriptions. Diagram views use these through useSyncExternalStore; other consumers include geometry, selection, change descriptions, and saving. The service must continue to own the canonical editable diagram and publish its existing granular events.

## Work

* Create a session-owned read adapter with the existing snapshot and subscription behavior. It reads the current session state and subscribes to the session's EventTarget; it owns no copy of the diagram or change registry. Keep the adapter object stable across session start and discard so React subscriptions do not capture an obsolete session.
* Move the snapshot and subscription methods from the session to the adapter. Migrate production consumers and test fixtures to the new read API, including DiagramSaveService, diagram geometry, diagram views, and change review. Remove the old methods after their callers have moved; do not add forwarding compatibility methods.
* Preserve snapshot values and reference stability. A field edit must not replace collection ID lists or emit a broad diagram event. The complete editable diagram remains a read boundary for persistence and processing, not a React subscription.

## Verification

* Focused tests cover field-scoped subscriptions, stable collection snapshots after a field edit, changed collection snapshots after membership or order edits, and subscriptions surviving session replacement.
* Run the affected service and diagram-view tests, typecheck, and app lint. Record the net lines removed from diagram_edit_session_service.ts.
