---
author: 
id: F_410
internalId: 7df9f053-e015-45b7-ba7a-9f4f0945ef60
title: finish release broken
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__7df9f053-e015-45b7-ba7a-9f4f0945ef60.json
policy:
---
after running 'finish release' we get a lot of these errors:

`Some agent conversations could not be loaded and were skipped: design/activity/card__945c9334-4a6a-4f98-b59e-38aaa853b5e6.json`

this is not normal. why is this happening, how to fix it?



internally we get errors like:

```&#x60;&#x60;&#x60;

Error: Malformed activity file: missing origin
    at rehydrateBridgeError (c:\Users\janbo\Documents\dev\md2\app\src\data\bridge_error_rehydration.ts:15:19)
    at unwrapBridgeResult (c:\Users\janbo\Documents\dev\md2\app\src\data\bridge_error_rehydration.ts:28:11)
    at unwrapBridgePromise (c:\Users\janbo\Documents\dev\md2\app\src\data\bridge_error_rehydration.ts:38:12)
    at async http://localhost:5173/src/services/agents/agent_integration.ts?t=1791299098775:39:26
    at async runConcurrentMapWorker (c:\Users\janbo\Documents\dev\md2\app\src\services\concurrency.ts:14:39)
    at async Promise.all (index 0)
    at async mapWithConcurrency (c:\Users\janbo\Documents\dev\md2\app\src\services\concurrency.ts:29:5)
    at async resolveCardConversations (c:\Users\janbo\Documents\dev\md2\app\src\services\agents\agent_integration.ts:74:21)
    at async AgentIntegration.resolveAndAttachAgentConversations (c:\Users\janbo\Documents\dev\md2\app\src\services\agents\agent_integration.ts:487:26)
    at async AgentIntegration.ensureAgentConversationsForCard (http://localhost:5173/src/services/agents/agent_integration.ts?t=1791299098775:260:9) {name: 'Error', stack: 'Error: Malformed activity file: missing origi…s/agent_integration.ts?t=1791299098775:260:9)', message: 'Malformed activity file: missing origin'}
```

## Current state

- `app/src/data/release_archiving.ts` already moves card activity into release folder and rewrites archived card's `agents` references. Card identity remains `Card.header.internalId`; conversation identity remains `AgentConversation.id`. Paths locate persisted files.
- In `app/src/services/release_operations.ts`, `completeRelease()` commits moves, refreshes usage, then calls `resetAgentConversations()` when project activity was archived. It applies moves to in-memory project state only after push and branch cleanup.
- Reset callback in `app/src/services/data/data_service.ts` immediately starts active-card conversation loading. Cards still reference old activity paths, but commit already removed those files. This ordering explains warnings across released cards whenever project activity triggers reset.
- `desktop/src/actions/activity/activity_files.js` treats missing file as empty activity. Conversation loaders call `readActivityFile()` without origin, so missing file reaches `createActivityFile(undefined)` and throws `Malformed activity file: missing origin`. Origin means activity owner: project, or card identified by `cardInternalId`. Error therefore does not prove stored JSON lost its origin.
- `app/src/services/agents/agent_integration.ts` records load errors and warns per card. Bridge rehydration and bounded concurrency transport these failures; neither causes missing files. Existing release tests cover archive contents and retained project conversations, but not reload timing against removed source paths.

## Implementation details

1. In `ReleaseOperations.completeRelease()`, after successful release commit, apply card/activity moves to project state before restarting conversation loading or awaiting usage refresh, push, or branch cleanup. Restart loading for every release that moves card activity or splits project activity; release without project activity must also discard cached conversation paths. Notify subscribers after state and loading generation are updated. Loading generation means token used to reject results from loads started before reset.
2. Keep branch deletion after successful automatic push. Apply subsequently committed branch-field changes to archived cards without replaying source moves. If usage refresh, push, or cleanup fails after release commit, preserve already-applied archive paths and report failure. If release commit fails, apply no moves and start no release-triggered reload. Retain release-lock cleanup in `finally`.
3. In desktop activity reads, distinguish optional activity from explicitly referenced activity. When `readActivityFile()` receives no origin and referenced file is absent, throw clear missing-file error containing path; do not fabricate empty activity or infer owner from filename. Existing malformed JSON must still fail validation. Keep existing in-memory migration and atomic writes unchanged.
4. Call-site impact: `loadActivityConversations()` and `loadActivityConversation()` require referenced files and receive new missing-file diagnostic. `listAgentConversationReferences()`, `loadCardActivity()`, and `action_files.js:loadActionRunHistory()` supply origin and retain empty activity for absent optional files. `loadActivityValue()` callers in activity updates, agent persistence, and token-usage updates retain creation behavior. Release reset callback has one caller; change its timing there. Project-loading resets remain unchanged.
5. Preserve archive reference rewriting, conversation IDs, activity contents, usage/stat totals, and genuine load warnings. No schema change, data repair, compatibility flag, or warning suppression required. Use existing generation checks to discard superseded loads. Cover behavior with in-process storage/filesystem mocks; do not run Git or agents in tests.

## Acceptance criteria

- Release containing card activity and completed project activity produces no skipped-conversation warnings for moved files. Reload starts only after card references and repository paths point into release folder; retained active cards load from unchanged paths.
- Release moving card activity without archivable project activity also invalidates cached paths. Opening archived card or pinned card conversation resolves release activity path and preserves conversation identity and content.
- Load finishing after release reset cannot restore old conversation paths or publish old load warnings. Repeat release with another name and subsequent project reopen remain loadable.
- Failed release commit leaves current card paths and conversation loading unchanged. Failures after successful commit retain archive state; failed automatic push still deletes no branches. Successful branch cleanup updates archived branch metadata.
- Missing explicitly referenced activity reports missing path, not `Malformed activity file: missing origin`. Existing file lacking required origin still reports malformed activity. Absent optional activity still loads empty activity; errors are never silently discarded.
- Add regression coverage in `app/src/services/release_operations.service.test.ts`, `app/src/services/agents/agent_integration.test.ts`, and `desktop/src/actions/activity/activity_files.test.mjs`. Run affected test files independently and `npm run lint` in both subprojects; no full test suite needed.
