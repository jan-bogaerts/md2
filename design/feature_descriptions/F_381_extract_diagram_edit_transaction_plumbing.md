---
id: F_381
internalId: 01ea4d5c-a0e7-4345-aa53-f074e0d8a20f
status: new
title: Extract diagram edit transaction plumbing
---

# Extract diagram edit transaction plumbing

## Current state

`DiagramEditSessionService` is about 1,800 lines. It owns the editable diagram, collection indexes, semantic change registry, dirty state, and the `EventTarget` used by diagram views. Edit methods also build membership events, validate operations, generate IDs, and publish transactions. These shared mechanics are concentrated near the bottom of `diagram_edit_session_service.ts` and are needed by the later editor splits.

## Work

* Introduce one internal edit context for access to the session-owned diagram, indexes, validator, change registry, ID generator, and transaction publisher. Keep the canonical editable diagram and its lifecycle under `DiagramEditSessionService`; the context must not clone it or become a second source of truth.
* Move operation validation, ID allocation, membership-event construction, and transaction finalization into focused modules. Keep the session as the sole event target. The context should expose the narrow operations editors need, rather than making mutable indexes public.
* Preserve publication order: collection removal pre-notifications, dirty change, semantic change notifications, membership notifications, then affected field notifications. Keep events scoped to the changed field or membership. Session start, discard, and save acknowledgement retain their current reset behavior.
* Remove moved methods from the session. Do not keep methods that only forward to the extracted modules. Preserve the existing public edit API until the editor jobs migrate its callers.

## Verification

* Focused tests cover event order for a field edit, collection deletion, and a change reverted to its baseline; ID collision failure; validation failure without mutation; and save acknowledgement resetting the baseline.
* Typecheck, the affected diagram tests, and app lint pass. Record the session file's line count after the extraction.
