---
author: 
id: B_161
internalId: 575b64d1-3ac4-41e5-ba72-eebcd3eed8cd
title: <unknown>
status: design
owner: 
affects:
agents:
  - design/activity/card__575b64d1-3ac4-41e5-ba72-eebcd3eed8cd.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 141899071
sentryOrganization: elastetic
after: cd2dca75-15df-4f60-b640-8a8a91aba68e
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

After accepting watched Markdown, project loading runs `ensureCardInternalIds()` and obsolete `migrateAgentLogReferences()`. Both can schedule a commit. They have no place in external file synchronization: client receiving a new or changed card owns no edit and must only parse and display received content. `ManagedOpenDocument.renew` is also intended to replace a clean draft without marking it dirty.

Reported sequence proves one receiving client nevertheless creates pending or dirty state before next external update. Available telemetry does not identify first mutation. Correct invariant is strict: watched card remains clean until user edits it on that client. No migration, normalization, metadata repair, or other automatic write may claim ownership during watcher processing.

## implementation details

- Reproduce with client X creating then updating card through WebSocket while client Y has no user interaction. Record first client-Y call to `CommitBatcher.schedule`, `CommitBatcher.schedulePathChange`, or `ManagedOpenDocument.updateDraft`; this identifies unsolicited writer without weakening conflict guard.
- Remove `ensureCardInternalIds()` from watched-file reload path. Remove obsolete agent-reference migration from runtime code; do not add replacement migration or fallback. Any still-required identity validation belongs to initial project loading, before synchronization starts, and must not write because of watcher input.
- Ensure watched new/changed card updates owned project state and renews clean open document without calling any card mutation, save, or draft-edit API. Parsed content must remain byte-for-byte source for later display until user edits.
- Fix identified unsolicited writer directly. Do not clear pending state, acknowledge dirty state, merge versions, suppress warning, or overwrite local edits as workaround.
- Preserve watcher conflict guard when user actually changed card on receiving client. Pending commit or dirty document still blocks later external overwrite and reports existing warning.
- Keep watcher echo suppression, removals, rename handling, regular Markdown files, action definitions, project config, and Git merge-conflict handling unchanged.
- Add focused project-loading, open-document, and desktop WebSocket remote-control tests. Two client states share one watched project; client Y receives create and multiple updates without user input, then separate case performs user edit on Y before external update.

## acceptance criteria

- Client Y receives card created and repeatedly updated by client X without scheduling commit, changing draft revision, showing dirty state, writing file, or reporting `External change ignored`.
- Watched create/update never runs internal-ID or agent-reference migration. Received content remains unchanged until explicit user edit on that client.
- Clean open editor updates to latest external card content and remains clean.
- User edit on client Y marks card dirty and schedules persistence through existing edit flow.
- External update arriving after real user edit on Y remains blocked; local edit stays intact and existing conflict warning appears.
- Removing unsolicited write fixes reproduced sequence at source. Implementation adds no merge behavior, dirty-state clearing, warning suppression, compatibility flag, or watcher migration.
- Watcher echoes, local in-flight commits, removals, rename events, regular Markdown files, action definitions, project config, and Git merge conflicts keep current behavior.
- Focused app and desktop tests, app unit tests, typecheck, and linters pass.
