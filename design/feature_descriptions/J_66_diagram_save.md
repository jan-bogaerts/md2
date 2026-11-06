---
author: 
id: J_66
internalId: ac32ed09-2e05-4ae3-9a90-8a03bba61616
title: diagram save
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__ac32ed09-2e05-4ae3-9a90-8a03bba61616.json
policy:
after: 204e1fa2-8e5e-4fd1-b63c-06c9c762c080
---

we currently have a separate button on the diagram tab of the app bar to save the diagram separately. not certain what the value is of this.

We should remove this and instead use the default save button on the 'home' tab. When a user edits the diagram, it should, like all other cards and actions and such be saved automatically through the [commit_batcher.ts](app/src/data/commit_batcher.ts)

## Current state

During diagram editing, the Diagram tab shows a separate `DiagramSaveButton`. It calls `DiagramSaveService.save()`, which queues current edited diagram copy and diagram index, then immediately flushes shared commit batch.

Diagram edits already enter normal persistence automatically. `DiagramSaveService` subscribes to model mutations, serializes canonical diagram data, and asks `DiagramViewService` to queue diagram copy and index changes. `DataService.scheduleDiagramCommit()` sends them to `CommitBatcher`, which commits after configured automatic delay. Home-tab Commit button and `Ctrl+S` also flush same pending batch through `ProjectPersistenceService`.

`DiagramSaveService.save()` has two other workflow uses: Review dialog saves before closing, and New diagram creation saves dirty current diagram before switching. Those uses protect workflow transitions and are not duplicate toolbar controls.

## Implementation details

* Remove `DiagramSaveButton` from `DiagramMenuTab`, then remove unused button component and its focused component test.
* Update `DiagramMenuTab` tests to require edit, clipboard, review, metadata, legend, formatting, and comparison controls without a diagram-specific Save/Saved button.
* Keep automatic model-mutation subscription and existing persistence chain: `DiagramSaveService` queues canonical diagram copy plus diagram index through `DiagramViewService`, `DataService`, and `CommitBatcher`. Do not add direct file writes or another diagram persistence path.
* Keep `DiagramSaveService.save()` for Review and New diagram transition workflows. Those operations still require an immediate flush before their next step.
* Keep Home-tab Commit button and `Ctrl+S` as manual immediate-flush entry points. Automatic `CommitBatcher` timer remains normal background persistence path.
* Preserve failure behavior. Queue failures use diagram error dialog; commit failures remain pending, keep edit session dirty, and use project persistence error reporting.
* Retain service tests proving model mutation queues without explicit Save and acknowledgement occurs only after persistence. Add or adjust menu and project-persistence coverage proving diagram changes enable and flush through shared Commit action.

## Acceptance criteria

* Diagram tab contains no diagram-specific Save or Saved control before, during, or after an edit.
* Editing diagram automatically queues canonical diagram copy and diagram index in shared `CommitBatcher`; user does not need to open Home tab or press Save first.
* Queued diagram changes make shared project persistence dirty, enable Home-tab Commit action, and can be flushed with Home Commit or `Ctrl+S`.
* If user takes no manual action, configured automatic commit delay flushes queued diagram and index changes through normal batch flow.
* Successful persistence acknowledges saved copy and clears diagram dirty state only for data included in that commit. Edits made during persistence remain dirty and queue again.
* Commit failure leaves diagram changes pending and editable, with existing user-visible error reporting.
* Review dialog Save and dirty-diagram handling before New diagram creation still complete immediate persistence before closing or switching diagrams.
* Cards, actions, other files, diagram Review behavior, diagram creation, commit batching, push behavior, and read-only behavior remain unchanged.
