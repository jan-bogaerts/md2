---
author: 
id: B_170
internalId: c8999726-4f9a-4963-ba9b-7c32b2190156
title: sub agent support claude
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__c8999726-4f9a-4963-ba9b-7c32b2190156.json
policy:
after: bfad1b82-e967-48bc-af8f-a11ce1fa4a55
---
claude tried to start a sub agent which terminated the conversation. we need to add full support to sub agents in claude

## Current state

md2 runs Claude as a child process. `buildClaudeStreamingCommand` in `shared/agent_profiles.mjs` starts it with `--print --verbose --output-format stream-json --include-partial-messages --input-format stream-json --permission-prompt-tool stdio`, and `createAgentEnvironment` in `desktop/src/actions/agent/agent_environment.js` copies the parent environment with only the two debugger variables removed. Nothing in that command line or environment mentions sub agents.

`ClaudeStreamingAdapter` in `desktop/src/actions/agent/agent_claude_streaming_adapter.js` decodes that stream. It keeps exactly one set of turn state fields for the whole process: `activeMessageId`, `activeBlocks` keyed by content-block index, `activeTextOrdinal`, and `turnHasAssistantText`. That design assumes a single message is being streamed at any moment.

Claude marks every message produced by a sub agent with `parent_tool_use_id`, naming the `Agent` tool call that spawned it. Neither `agent_claude_streaming_adapter.js` nor `agent_claude_events.js` reads that field, so parent and sub-agent frames are folded into the same state:

* A sub-agent `message_start` overwrites `activeMessageId` and clears `activeBlocks`. A `content_block_delta` belonging to the parent message that arrives afterwards no longer finds its tracked block, so `handleContentBlockDelta` calls `emitProtocolError('invalid content_block_delta')` and the parent's streamed text stops growing.
* `handleToolResults` resolves a `tool_result` by searching `activeBlocks` for the matching `tool_use` id. After the interleaved clear, the parent's tool call is gone from that map, so its result is rendered as a bare `tool.result` row instead of completing the original tool row.
* Sub-agent text blocks reach `handleAssistantCompletion` and become ordinary assistant items, so sub-agent output is attributed to the main agent in the transcript and in `run.assistantItems`.

Errors thrown out of `handleMessage` are not recoverable. `handleStreamingLine` in `desktop/src/actions/agent/agent_runner_service.js` catches them and calls `failStreamingRun`, which marks the conversation `failed`, appends the error, ends the child's stdin and terminates the process tree. Every `throw new Error(...)` in the adapter is therefore a conversation-ending event, which is what the reported crash looked like from the user's side.

Approvals are unaffected in shape — a sub agent's tool request arrives as the same `control_request` with subtype `can_use_tool`, keyed by a unique `request_id` — but `claudeApprovalRequest` records no origin, so the approval card cannot tell the user that a sub agent, not the main agent, is asking.

By default the Claude CLI does not forward sub-agent text or thinking at all; that requires the `--forward-subagent-text` flag or the `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT` environment variable. Nested sub agents (depth two and deeper) are also only forwarded when that setting is on, keyed by the `Agent` tool-use id that spawned them.

Two more places constrain the fix. `normalizeEvent` in `shared/agent_conversations.mjs` rebuilds every event entry from an explicit field whitelist, so any field it does not know about is dropped when a conversation is persisted and reloaded. And `buildActionConversationRenderGroups` in `app/src/components/actions/conversation/action_conversation_render_groups.ts` produces a flat list of groups; the only existing nesting is `CompletedToolCallGroup`, which collapses adjacent completed tool calls.

## implementation details

* Turn forwarding on through the environment rather than the command line: in `desktop/src/actions/agent/agent_environment.js`, set `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT=1` for Claude runs unless the user's environment already sets it. An unrecognized command-line flag makes an older Claude CLI exit immediately, while an unrecognized environment variable is ignored, so the environment route degrades safely on older installs.
* Replace the adapter's single turn state with one state record per stream, held in a `Map` keyed by `parent_tool_use_id` (the main agent uses a `null` key). Each record owns its own `activeMessageId`, `activeBlocks`, `activeTextOrdinal` and `turnHasAssistantText`. `handleStreamEvent`, `handleAssistantCompletion` and `handleToolResults` each resolve their record from the event's `parent_tool_use_id` before touching any state, so interleaved parent and sub-agent frames can no longer clear each other.
* Namespace generated provider item ids with the owning stream key, so a sub-agent message id can never collide with a parent one. Ids that come from Claude itself (`tool_use` ids) stay unchanged, because they are already unique across the session.
* Resolve `tool_result` blocks by searching every stream's tracked tool blocks for the `tool_use` id, instead of only the currently active map. This also repairs the existing case where a parent tool completes after the next message has started.
* Emit sub-agent activity as event entries carrying a new optional `parentItemId` field set to the spawning `Agent` tool-use id, never as assistant message items. Sub-agent text becomes an event, sub-agent thinking stays a `reasoning` event, and sub-agent tool calls stay `tool.*` events. Keeping them out of the message stream matters because `lastMessageEntry` drives `updateProviderSession`, which records how far the provider session is synchronized; a sub-agent message entering that stream would corrupt resume.
* Only a `result` event without `parent_tool_use_id` ends the turn. `handleResult` ignores any result frame that carries one, so a sub agent finishing cannot clear the parent's pending approvals or trigger the context-usage request.
* Stop making unknown frame shapes fatal. Replace the `throw new Error(...)` calls in `claudeApprovalRequest`, `handleContentBlockStart` and `handleAssistantCompletion` that sub-agent traffic can now reach with `emitProtocolError`, so a frame md2 does not understand degrades to one visible error row rather than killing the conversation. Genuine writer failures keep throwing.
* Carry origin on approvals: add `parentItemId` and the sub agent's label to the approval object built by `claudeApprovalRequest`, thread it through `handleApproval` in `desktop/src/actions/agent/agent_streaming_event_handlers.js` unchanged, and show it in the approval card so the user sees which agent is asking. Decision handling and `availableDecisions` stay as they are.
* Persist the new field: add `parentItemId` to `createProviderEventEntry` in `desktop/src/actions/agent/agent_conversation.js`, to the whitelist in `normalizeEvent` in `shared/agent_conversations.mjs`, and to `AgentConversationEvent` in `app/src/data/data_types.ts`. It is optional, so no activity-file version bump is needed and older files stay readable.
* Nest in the transcript: extend `buildActionConversationRenderGroups` with a `subAgent` group that collects consecutive entries sharing a `parentItemId` and attaches them to the `tool.Agent` entry with that provider item id. Render it with a new component modeled on `CompletedToolCallGroup` — collapsed by default, header showing the sub agent's label and the entry count, expanded body reusing `ActionConversationEventRow`. Entries whose `parentItemId` names a tool call that never arrived render flat, so a truncated stream still shows its content.
* Nested sub agents (depth two and deeper) attach to the `Agent` tool call that spawned them, which is itself a sub-agent entry, so the grouping is applied recursively rather than only one level deep.
* Tests: extend `desktop/src/actions/agent/agent_streaming_adapter.test.mjs` with interleaved parent and sub-agent frames, a sub-agent approval, a sub-agent `result` frame, and a nested sub agent; extend the conversation round-trip coverage in `shared` so `parentItemId` survives persist and reload; extend `app/src/components/actions/conversation/action_conversation_rendering.test.tsx` for nesting, collapse and the orphaned-parent case.

## acceptance criteria

* A Claude conversation in which the agent spawns one or more sub agents runs to completion; no sub-agent frame marks the conversation `failed` or terminates the child process.
* Parent assistant text streamed before, during and after a sub agent's run stays in one transcript message with its content intact, and no `Claude protocol error` row appears for well-formed traffic.
* A tool call issued by the main agent completes on its own transcript row even when sub-agent frames arrive between the call and its result.
* Sub-agent text, thinking and tool calls appear grouped under the `Agent` tool call that spawned them, collapsed by default, with the sub agent's label and entry count in the header.
* Sub agents nested more than one level deep appear under their own spawning `Agent` entry, not flattened into the top-level sub agent's group.
* No sub-agent output appears as a main-agent assistant message, and the provider session id recorded for resume is unchanged by sub-agent activity.
* An approval requested by a sub agent shows which agent asked, and accepting, declining or cancelling it behaves exactly as the equivalent main-agent approval.
* Reopening a persisted conversation reproduces the same nesting, because `parentItemId` survives the round trip through the activity file.
* Activity files written before this change still load, and files written after it remain readable by the current parser without a version bump.
* On a Claude CLI that does not support sub-agent text forwarding, the run still starts and completes, showing the `Agent` tool call and its result without nested content.
* Token usage, cost and context-window figures for the turn are unchanged by sub-agent activity, since only the top-level `result` frame reports them.