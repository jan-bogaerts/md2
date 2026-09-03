---
author: 
id: F_214
internalId: 10a50270-fcab-4661-9d29-d966aa99eb1e
title: improve support child threads
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__10a50270-fcab-4661-9d29-d966aa99eb1e.json
policy:
after: 9b601eb4-e385-404f-9059-07823b25b6fd
changedFiles:
  - app/src/components/actions/conversation/action_conversation_render_groups.ts
  - app/src/components/actions/conversation/action_conversation_rendering.test.tsx
  - desktop/src/actions/agent/agent_streaming_adapter.js
  - desktop/src/actions/agent/agent_streaming_adapter.test.mjs
---
codex can use child threads. currently we either ignore them or print them in the main conversation thread.

Not certain if claude has similar concept.

we should show in the ui that sub threads are running.

need to think some more on how best to show visually. codex uses sub-converations where a user can click on the thread and that opens the sub conversation. with arrow can go back to root conversation

## Current state

Codex child threads exist and md2 discards them. When the root agent calls a collaboration tool, the Codex app-server sends the root thread a `collabAgentToolCall` item that carries `tool`, `prompt`, `receiverThreadIds` (the child thread ids it started) and `agentsStates` (per child thread status). It then sends the child thread's own `turn/started`, `item/*`, `thread/tokenUsage/updated` and `turn/completed` notifications, all tagged with that child `threadId`.

`CodexStreamingAdapter.handleNotification` in `desktop/src/actions/agent/agent_streaming_adapter.js:337` returns immediately for any notification whose `params.threadId` differs from the root `this.threadId`. Every child-thread notification is therefore dropped before reaching item, usage or turn handling. The test named `ignores child-thread notifications while preserving root collaboration and completion` in `desktop/src/actions/agent/agent_streaming_adapter.test.mjs:973` pins that behaviour deliberately, because the adapter's state is single-threaded: `activeItems`, `assistantItemOrder`, `assistantStreams`, `completedItemIds`, `activeTurnId`, `turnUsage`, `turnUsageBaseline` and `turnContextWindowUsage` are one flat set for the whole process, and `turn/started` clears all of them. Letting a child thread through without splitting that state would make a child turn erase the root turn's tracked items and end the root turn early.

What the user sees today is one row: `normalizeCodexEvent` maps the root item to a `Collaboration: <tool>` event (`collaborationEvent` in `desktop/src/actions/agent/agent_codex_event.js:257`), whose `output` is a flattened text rendering of `receiverThreadIds` and `agentsStates`. The row shows `Running` while the collaboration item is in progress, but nothing the child threads do is visible, and their token usage is not counted.

Approvals from a child thread are worse than invisible. `handleApprovalRequest` (`agent_streaming_adapter.js:259`) throws `Mismatched Codex approval thread id` when `params.threadId` is not the root thread. That error propagates out of `handleMessage`, and `handleStreamingLine` in `desktop/src/actions/agent/agent_runner_service.js` turns any such throw into `failStreamingRun`: the conversation is marked `failed` and the process tree is killed. So a child thread asking to run a command ends the whole conversation.

The Claude side of the same problem was solved in `B_170`, and everything it built is provider-neutral and reusable:

* Events carry an optional `parentItemId` naming the tool call that spawned the owning sub agent. It is set in `createProviderEventEntry` (`desktop/src/actions/agent/agent_conversation.js:55`), survives persistence through the whitelist in `normalizeEvent` (`shared/agent_conversations.mjs:137`), and is declared on `AgentConversationEvent` in `app/src/data/data_types.ts:294`.
* Sub-agent assistant text is emitted as an event of type `agentMessage` with a label, never as a main-agent message entry, so the provider session resume pointer stays clean.
* `buildActionConversationRenderGroups` in `app/src/components/actions/conversation/action_conversation_render_groups.ts` walks `parentItemId` chains and nests descendants under the spawning call as a `subAgent` group, recursively. `SubAgentGroup` renders it collapsed by default with the label and a descendant count, and expands on click.
* Approvals carry `parentItemId` and `subAgentLabel` (`app/src/data/action_run_types.ts:113`), and `action_agent_approval.tsx:119` shows `Requested by: <label>`.

The gaps for Codex are therefore: the adapter's single-thread state and its child-thread drop, the missing `parentItemId` on Codex events, the fatal child-thread approval, and the renderer's spawning-call detection, which recognises only Claude's `tool.Agent` entries.

## Implementation details

* Split the adapter's turn state per thread. Replace the flat fields with a `Map` keyed by `threadId` (root thread included), each record owning `activeTurnId`, `activeItems`, `assistantItemOrder`, `assistantStreams`, `completedItemIds`, `turnUsage`, `turnUsageBaseline` and `turnContextWindowUsage`. `handleNotification` resolves the record from `params.threadId` (defaulting to the root thread when absent) before touching state, so a child `turn/started` clears only that child's items. This mirrors the per-stream `Map` that `B_170` introduced in `ClaudeStreamingAdapter`.
* Stop dropping child-thread notifications. Accept a notification whose `threadId` is a known child thread, meaning one listed in `receiverThreadIds` of a tracked `collabAgentToolCall` item, or a thread already registered as a descendant of such an item. Notifications for a thread that is neither the root nor a known child stay ignored, so unrelated traffic cannot inject rows into the conversation.
* Maintain a child-thread registry mapping `threadId` to the `collabAgentToolCall` item id that spawned it, recorded when that item starts and extended when `item/completed` reports further `receiverThreadIds`. A collaboration tool call made inside a child thread registers its own children against that inner item id, which makes the ownership chain recursive without extra machinery. Registry entries live for the run, not the turn, because a child thread can outlive the collaboration item's own in-progress window.
* Tag every event produced from a child-thread notification with `parentItemId` set to the spawning `collabAgentToolCall` item id. `normalizeCodexEvent` already produces the event shape; the adapter attaches ownership after normalization, exactly as the Claude adapter's `ownedEvent` helper does. Namespace generated provider item ids with the owning thread id so a child item id cannot collide with a root one; ids that Codex itself supplies stay unchanged.
* Emit child-thread assistant text as an `agentMessage` event carrying `parentItemId` and a label, not as assistant message content. Do not route child `item/agentMessage/delta` through `flushAssistantStreams`, which feeds the main assistant message stream and drives `updateProviderSession`; a child message entering that stream would corrupt resume. The label is the collaboration tool name from the spawning item, falling back to `Sub agent`.
* Only the root thread's `turn/completed` ends the turn. A child `turn/completed` closes that child's record and resolves approvals owned by that child's turn; it must not clear `activeTurnId`, `pendingQuestions` or the root's pending approvals, and must not emit `turnCompleted`. Likewise `sendMessage` steers using the root record's `activeTurnId` only, so steering a running root turn keeps working while child threads run.
* Count child-thread token usage. Keep a separate `turnUsageBaseline` per thread, since `thread/tokenUsage/updated` totals are cumulative per thread, and report the sum of root growth and every child's growth as the turn's usage. Context-window usage stays root-only: the figure describes one thread's context, so summing across threads would be meaningless. Emit usage events as the numbers change rather than only at turn end, matching current behaviour.
* Make child-thread approvals work instead of fatal. In `handleApprovalRequest`, accept a `threadId` that is the root or a known child thread, resolve the item from that thread's record, and set `parentItemId` to the spawning collaboration item id plus `subAgentLabel` to that item's label. `handleApprovalResolved` and `resolveApprovalsForTurn` compare against the approval's own recorded thread and turn rather than the root's. Decisions, `availableDecisions` and the write path are unchanged. The approval card already renders `Requested by`, so no new UI is needed there.
* Downgrade child-thread protocol surprises. An unknown or out-of-order child notification emits a diagnostic event through the existing `emitDiagnostic` path instead of throwing, because a throw out of `handleMessage` fails the conversation and kills the process. Genuine writer failures keep throwing.
* Extend the renderer's spawning-call detection. In `action_conversation_render_groups.ts`, treat an entry of type `collabAgentToolCall` that has a `providerItemId` as a spawning call alongside `tool.Agent`, so its descendants nest into a `subAgent` group. Give `subAgentLabel` a Codex branch: use the entry's `label`, which is already `Collaboration: <tool>`, rather than parsing the content as JSON tool input. Nesting, recursion, the orphan fallback for a missing parent entry, and `SubAgentGroup` itself need no change.
* Show that child threads are running. The spawning collaboration row stays visible above the collapsed group and already carries `status`, so `eventStatusLabel` renders `Running` until the item completes. Add the running child count to the group header, derived from the collaboration entry's `agentsStates`, so a collapsed group states how many child threads are still working. This stays read-only; there is no per-thread cancel.
* Persistence, activity files and stats need no schema change. `parentItemId` is already optional in `createProviderEventEntry`, `normalizeEvent` and `AgentConversationEvent`, so no version bump is required and older activity files stay readable. Child-thread tool events of already-counted types will now appear in `shared/project_stats.mjs` tool counts and in the handoff transcript built by `desktop/src/actions/agent/agent_transcript.js`; that is intended, since the work really happened, and both read the same canonical event shape.
* Claude behaviour must not change. Any helper extracted for ownership tagging or per-stream state is shared, but the Claude code paths keep their current output unchanged.
* Tests: replace the `ignores child-thread notifications` test in `agent_streaming_adapter.test.mjs` with coverage of interleaved root and child frames, a child thread's tool call and assistant text nesting under the collaboration item, a child-thread approval that resolves without failing the run, a child `turn/completed` that does not end the root turn, steering the root turn while a child runs, usage summed across threads with context window taken from the root only, a collaboration call nested inside a child thread, and an unknown thread id still ignored. Extend the round-trip coverage in `shared` so a Codex `parentItemId` survives persist and reload, and extend `app/src/components/actions/conversation/action_conversation_rendering.test.tsx` with Codex nesting, collapse, the running-count header and the orphaned-collaboration case.

## Acceptance criteria

* A Codex conversation whose root agent spawns child threads runs to completion; no child-thread notification, approval or error marks the conversation `failed` or terminates the process tree.
* Child-thread tool calls, reasoning and assistant text appear in the transcript, grouped under the `Collaboration: <tool>` row that spawned them, collapsed by default, with the tool label and a descendant count in the header.
* While child threads are working, the collaboration row shows a running status and the collapsed header states how many child threads are still running; both settle when the collaboration item completes.
* A collaboration call made inside a child thread nests under that child's own entry rather than being flattened into the outermost group.
* Child-thread output never appears as a main-agent assistant message, and the provider session id recorded for resume is unchanged by child-thread activity.
* The root turn ends only on the root thread's `turn/completed`. A child thread finishing does not end the root turn, does not clear the root's pending approvals or questions, and does not emit a second `turnCompleted`.
* Steering the running root turn with a new user message still targets the root turn while child threads run.
* An approval requested by a child thread reaches the user, names the collaboration that asked, and accepting, declining or cancelling it behaves exactly as the equivalent root-thread approval.
* Turn token usage is the sum of root and child-thread growth, with no double counting across repeated cumulative readings, and context-window usage continues to report the root thread only.
* Notifications for a thread that is neither the root nor a registered child are ignored and produce no transcript rows.
* Reopening a persisted conversation reproduces the same nesting, because `parentItemId` survives the round trip through the activity file, and activity files written before this change still load without a version bump.
* Claude sub-agent grouping, approvals, usage and transcript output are unchanged.