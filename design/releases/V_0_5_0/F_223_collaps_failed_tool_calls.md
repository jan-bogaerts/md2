---
author: 
id: F_223
internalId: 2bdcda91-18c2-42ea-8ebb-1208250a4d42
title: Collaps failed tool calls
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__2bdcda91-18c2-42ea-8ebb-1208250a4d42.json
policy:
changedFiles:
  - app/src/components/actions/conversation/action_conversation_chat.test.tsx
after: e04c89e9-d394-435f-8f13-7d4bb9e942ff
---

We currently keep failed tool calls out of the tool call group. Lets skip this, so simplify grouping, group all, no matter if failed or not. Keep red color though for failed ones and add an 'errors' count in the toolcallsgroup header, if any, behind total count

## Current state

`buildActionConversationRenderGroups` in `app/src/components/actions/conversation/action_conversation_render_groups.ts` recognizes tool-call event types, but adds only events with `status === 'completed'` to an adjacent tool-call run. Two or more adjacent completed calls become a collapsed `completedToolCalls` group; one call remains a normal transcript row.

A failed or declined tool call does not qualify, so it ends the current run and renders as a separate row. `eventHasError` in `event_display.ts` defines both `failed` and `declined` as errors. `AgentToolEvent` and `CommandExecutionEvent` use that helper to render their text and ungrouped border with `error.main`.

`CompletedToolCallGroup` renders grouped rows in the root transcript and inside recursive `SubAgentGroup` content. Its collapsed header shows only `Tools called (<total>)`. Expanded rows reuse `ActionConversationEventRow`, so grouped error rows can retain their existing red text without new status rendering.

Running tool calls stay outside groups. `action_conversation_reservation.ts` treats these visible running rows as temporary layout blocks; terminal grouped rows are not temporary blocks.

## implementation details

- In `action_conversation_render_groups.ts`, replace completed-only eligibility with terminal tool-call eligibility. Include `completed`, `failed`, and `declined`; keep running or unknown statuses as individual rows. Preserve adjacency, transcript order, sub-agent ownership, and current rule that one eligible call renders as an individual row.
- Rename completed-specific group symbols and component names to describe terminal tool calls. Update both call sites: `ActionConversationTranscript` and recursive `SubAgentGroup`. Both receive new behavior; no call site keeps completed-only grouping.
- In tool-call group header, compute error count with existing `eventHasError` semantics. Show total first, followed by `errors: <count>` only when count is greater than zero. Keep group header's normal color; error emphasis remains on failed or declined rows when expanded.
- Keep expanded rendering through `ActionConversationEventRow`. Do not change `AgentToolEvent` or `CommandExecutionEvent` error colors, detail expansion, labels, or status text.
- Update focused rendering tests for mixed successful and failed adjacent calls, error count visibility, expanded red error rows, zero-error header, running-call boundaries, and equivalent grouping inside a sub-agent. Update reservation coverage only where renamed group types require it.

## acceptance criteria

- Two or more adjacent terminal tool calls collapse into one group whether each call completed, failed, or was declined.
- Group header shows total tool-call count first. When group contains errors, header also shows `errors: <count>`, where errors are calls with `failed` or `declined` status.
- Header omits error count when every grouped call completed successfully.
- Expanding mixed-result group shows every tool call once, in original order. Failed and declined rows retain existing red error styling and status labels; successful rows retain existing styling.
- Running and unknown-status tool calls remain individual rows and split adjacent terminal groups, so live progress stays visible.
- Single terminal tool call remains individual row, matching current grouping threshold.
- Root transcript and nested sub-agent transcript use same grouping and error-count behavior.
- Messages, reasoning events, sub-agent ownership, reservation behavior, and persisted conversation data remain unchanged.
