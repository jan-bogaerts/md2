---
author: 
id: B_161
internalId: 575b64d1-3ac4-41e5-ba72-eebcd3eed8cd
title: <unknown>
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__575b64d1-3ac4-41e5-ba72-eebcd3eed8cd.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 141899071
sentryOrganization: elastetic
after: 97733177-b4c8-47c3-af3d-64c31d4eca93
---
## Sentry issue

**Title:** \<unknown>

**Message:** External change ignored for design/feature\_descriptions/F\_216\_improve\_agent\_selection.md because the file has unsaved local edits.

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/141899071/)

**First seen:** 2026-08-20T17:18:28Z

**Last seen:** 2026-08-20T17:18:28Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Not provided

**Event ID:** 82d26347919a42eb815dbba515cc9eea

### Application stack frames

* No application stack frames provided.

We have had several of these errors lately. basically, it happens every time that the electron application is serving to external apps with websocket server. User creates card on remote, electron gets instruction through websocket, creates the file. then somehow, the react app running in electron does something or thinks it did something to the file causing it to be marked dirty and stored (I think) in the batch commiter. Meanwhile, the card gets updated on the external app, which syncs again through websockets, file change is noticed in electron and notifies the react app again running in electron, which still has it marked as dirty and then triggers this error. it is not an exception, so no stack frames, the error is manually entered I believe.
This is what I think is happening. There is something going wrong in the operation.

## Current state

Electron watches project files and sends each settled Markdown change to every connected React client, including desktop renderer and WebSocket clients. Each client loads changed file independently. `ProjectLoading.reloadMarkdownFilesFromWatchEvents` ignores change when same path exists in that client's `CommitBatcher` or an open card document is dirty, then reports `External change ignored ... because the file has unsaved local edits.` through `dialogService`. This is reported conflict, not thrown exception, so Sentry has no stack frame.

Current guard protects local work, but treats whole file as one value. It cannot distinguish local header edit from external body edit, identical changes, or two edits to same field. Message also does not identify whether commit batcher, open document, or both blocked reload. Existing echo suppression handles content already recorded by same client; it does not reconcile writes made by another client. Repeated remote create/update flow can therefore leave clients with different card state or produce warning for changes that could merge safely.

Here, **three-way reconciliation** means comparing last accepted file content (base), current in-memory card plus dirty body draft (local), and newly loaded file (external). A **conflict** exists only when local and external both changed same persisted field from base to different values.

## implementation details

- Add pure card reconciliation helper beside project/card data services. Compare body and each persisted frontmatter field through existing Markdown parser semantics. Preserve unknown frontmatter and formatting through parser source metadata; do not normalize values or add legacy shapes.
- In Markdown watcher reload, keep current content-echo and in-flight-commit checks first. When path has pending commit or dirty card document, run three-way reconciliation for changed/added card instead of rejecting whole file immediately.
- Apply external-only changes to owned `Card`, retain local-only changes and dirty draft, and treat equal local/external values as converged. Rebase parser source and stored file baseline to external file so later serialization includes external changes once and does not restore old content.
- If all local changes already exist externally, clear corresponding no-op pending change and mark matching draft saved. If any same-field values diverge, keep local card and draft unchanged, keep pending persistence, and report genuine conflict naming path and conflicting fields.
- Keep removals with unsaved local state as conflicts. Keep regular Markdown-file behavior, rename handling, action-definition reloads, project-config reloads, and Git merge-conflict handling unchanged.
- Extend conflict diagnostics with blocker source (`pending commit`, `dirty document`, or both) and field names. Do not capture ordinary accepted remote updates as errors.
- `CommitBatcher.hasPendingFile` keeps existing behavior for `DataService.hasPendingFile` and action-draft checks. Project loading alone receives reconciliation behavior; no compatibility flag or mode parameter is needed.
- Add focused tests for reconciliation helper, project watcher, open-document revision acknowledgement, commit-batcher rebasing/discard, and desktop WebSocket remote-control flow. Use two client states sharing one watched project to reproduce create, first sync, second update, and watcher delivery order.

## acceptance criteria

- Card created and then updated through WebSocket client reaches desktop renderer and every connected client without `External change ignored` when no field has divergent concurrent edits.
- Pending local header change and external body change merge. Pending local body change and external header change merge. Persisted result contains both changes after local batch flush.
- Same local and external value converges without warning, duplicate commit, or dirty indicator.
- Different local and external values for same body or frontmatter field keep local unsaved value and produce one user-visible conflict naming path, blocker source, and field.
- External deletion never discards pending or dirty local card. Existing removal conflict behavior remains.
- Accepted external update becomes new serialization baseline; later local save cannot restore older external fields or remove unknown frontmatter.
- Watcher echoes, local in-flight commits, rename events, regular Markdown files, action definitions, project config, and Git merge conflicts keep current behavior.
- Focused app and desktop tests, app unit tests, typecheck, and linters pass.
