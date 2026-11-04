---
author: 
id: B_321
internalId: b4209b86-7a2f-497f-a268-13acc153c748
title: codex sub agents report incorrect file changes
status: ready
owner: 
affects:
agents:
  - design/releases/0.10.0/card__b4209b86-7a2f-497f-a268-13acc153c748.json
policy:
after: 6636980d-0f8d-4f94-a4bb-b5a171ce8891
changedFiles:
  - app/src/components/actions/run/popup/action_usage_summary_data.node.test.ts
  - desktop/src/actions/agent/agent_streaming_adapter.js
  - desktop/src/actions/agent/agent_streaming_adapter.test.mjs
---

When an action runs an agent, we track the number of lines that were changed and removed. This works ok.

However, when codex runs tasks in parallel, we only seem to show the nr of lines that the root agent changed, not what the sub agents did.

We should show the total lines changed below the action popup's conversation log, across all agents that ran in parallel.

## Current state

The usage footer already sums every completed `fileChange` entry in the canonical conversation. Codex reports spawned agents through `subAgentActivity` items, but the desktop adapter does not support that item type or hydrate the referenced child thread. The child agent's file changes therefore never reach the conversation, so the footer can only count root-agent changes.

## Implementation details

- Handle Codex `subAgentActivity` items and register their `agentThreadId` as soon as the activity starts.
- Accept live notifications from registered child threads and tag their events with the owning sub-agent activity.
- When a child activity completes, read the child thread's turns and normalize any completed `fileChange` items that were not received live. Recursively discover nested sub-agent activities.
- Namespace provider item identities by thread ID and deduplicate live and hydrated events.
- Wait for the finite set of pending child-thread reads before publishing the root conversation as complete. Log a child-thread read failure and continue safely without inventing counts.
- Store child file changes through the existing canonical conversation event path. The existing usage footer aggregation remains unchanged.
- Add focused tests in the Codex adapter and usage aggregation suites for parallel agents, nested agents, live/history deduplication, and child-thread read failures.

## Acceptance criteria

- [ ] The conversation usage footer includes insertions and deletions reported by the root agent and every spawned Codex sub-agent.
- [ ] Parallel and nested sub-agent file changes are included exactly once.
- [ ] Live child-thread events and hydrated thread history cannot double-count the same file change.
- [ ] The root conversation does not complete before pending child-thread file-change reads finish.
- [ ] A failed child-thread read is logged, does not fail the action, and does not fabricate line counts.
- [ ] Existing root-only and non-Codex file-change reporting remains unchanged.
- [ ] Focused desktop and app tests pass.
