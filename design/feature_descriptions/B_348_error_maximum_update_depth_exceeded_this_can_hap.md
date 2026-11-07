---
author: 
id: B_348
internalId: 22edc81f-6888-44c5-8d8b-48207057c653
title: Error: Maximum update depth exceeded. This can hap
status: ready
owner: 
affects:
agents:
  - design/activity/card__22edc81f-6888-44c5-8d8b-48207057c653.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 159129008
sentryOrganization: elastetic
changedFiles:
  - app/src/components/actions/conversation/transcript/action_conversation_chatlog_tracker.node.test.ts
  - app/src/services/actions/action_run_registry.submissions.node.test.ts
  - app/src/services/actions/action_run_registry.ts
  - desktop/src/actions/agent/agent_run_state.js
  - desktop/src/actions/agent/agent_runner_service.js
  - desktop/src/actions/agent/agent_runner_state.test.mjs
  - desktop/src/actions/agent/agent_streaming_adapter.test.mjs
  - desktop/src/actions/agent/agent_streaming_event_publisher.js
  - desktop/src/actions/agent/agent_streaming_event_publisher.test.mjs
after: 93e1db0c-ddae-4680-a3ff-a21ec1fe1f0b
---

## Current state

The desktop streaming adapters publish every assistant, reasoning, command, and plan delta immediately. Since the October 22 sub-agent integration, `subAgentActivity` registers every child thread, so parallel child streams now use this same per-delta path. Recursive `thread/read` responses also publish every completed child file change separately.

Each published event crosses the Electron bridge and synchronously calls `ActionRunStore.update`. The chatlog tracker recomputes its snapshots and notifies React for every visible conversation change. A sufficiently dense burst therefore reaches React's nested synchronous update limit.

Prompt acknowledgement events add a second, smaller source of redundant work. `ActionRunRegistry.handleEvent` first updates the run store and then reconciles the corresponding pending submission. The chatlog tracker subscribes to both sources, so one backend prompt event can update it twice.

## Implementation details

### Coalesce streaming updates

- Add a shared desktop streaming-event publisher between the provider adapters and `AgentRunnerService`. It must serve both Codex and Claude rather than adding renderer-specific throttling.
- Apply a named, bounded publish interval. Within one interval, concatenate assistant output for the same message and retain only the latest cumulative in-progress provider event for each `providerItemId`.
- Preserve event order across different message and provider-item identities. Started, completed, question, approval, error, and terminal events must not overtake pending content for the same run.
- Flush pending content before its completed event and before turn completion. Cancellation, failure, and adapter disposal must clear the timer and settle or discard pending events according to the run outcome.
- Route child-history events through the same publisher. Limit each scheduled flush to a named maximum so a history containing many distinct file changes cannot recreate one large synchronous burst.
- Keep canonical conversation updates in the desktop service before renderer notification. Do not add timing logic to React components or the chatlog tracker.

### Remove duplicate prompt notifications

- Reconcile pending submissions before publishing the corresponding run-store update. The run listener must observe the updated run and submission state together.
- Do not dispatch a separate submissions event when reconciliation is caused by the same backend run event. `ActionConversationChatlogTracker` is the only production subscriber to submission changes and already refreshes from a run notification.
- Continue dispatching submissions events for submission-only operations such as local creation, transmission failure, or an enqueue response that is not accompanied by a run event.
- Keep prompt identity and state transitions unchanged.

### Tests

- Extend the streaming-adapter and runner tests with dense, interleaved root and child deltas, child-history replay, completion ordering, cancellation, and timer cleanup.
- Extend the run-registry submission tests to count tracker notifications for queued, sent, deleted, discarded, failed, and terminal prompt transitions.
- Add a chatlog regression test that processes a dense event sequence without exceeding a bounded number of external-store notifications and still exposes the final content.

## Acceptance criteria

- A burst of at least 100 interleaved root and child deltas is coalesced by message or `providerItemId`; it does not produce one renderer notification per provider delta.
- The number of events published in one scheduled flush never exceeds the named maximum.
- Final assistant text, reasoning, command output, plans, file changes, nesting, and event order match the provider's final state.
- Completed and terminal events cannot appear before their pending content, and no buffered event is emitted after cancellation or disposal.
- A backend prompt event that changes both run and submission state causes one chatlog tracker refresh, not two.
- Submission-only operations continue to notify the chatlog and preserve all existing prompt states and error handling.
- The focused desktop streaming, run-registry submission, and chatlog tracker tests pass independently.
- The production flow no longer reports React's maximum update depth error during parallel sub-agent activity or child-history replay.

## Sentry issue

**Title:** Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/159129008/)

**First seen:** 2026-11-06T13:42:27Z

**Last seen:** 2026-11-06T13:42:27Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Vr(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js)

**Event ID:** e2a20d3150714c59a14b5828769c2e96

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:149:9434` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:149:20067` — EventTarget.handleIncomingEvent
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:149:26389` — EventTarget.handleEvent
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:149:1284` — Sie.update
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:734:93011` — handleRunChange
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:734:94073` — ZHe.updateFromSources
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:734:97256` — ZHe.applyConversation
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:734:98012` — ZHe.publishViewChanges
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:25:6718` — ZHe.r
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:10:52219` — ZHe.<anonymous>
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:10:52338` — Do
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:10:27090` — zr
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:10:27517` — Vr
