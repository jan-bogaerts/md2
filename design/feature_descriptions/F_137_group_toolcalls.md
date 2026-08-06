---
author: 
id: F_137
internalId: 16bc6dc5-0f8e-421d-b0a9-c83d3a3a65f0
title: group toolcalls
status: new
owner: 
affects:
agents:
  - design/activity/card__16bc6dc5-0f8e-421d-b0a9-c83d3a3a65f0.json#conversation=agent-221e4f2f-03cb-429a-aada-7474d68aabb0
policy:
after: 4aa237a7-a946-4ce7-84ba-962826a44dfa
---
we need to improve how the conversation log shows the list of toolcalls.

Something similar has already been done for ´agent events´

For tool calls, we need to group all completed toolcalls within a sequence of toolcalls. The still running ones should remain individual boxes.

## Current state

Each provider tool call is stored as its own canonical conversation event. During execution, a later event with the same `providerItemId` replaces that entry, so a running tool call becomes completed, failed, or declined without changing position.

`ActionConversationChat` filters hidden events, then renders every remaining event through `ActionConversationEventRow`. `CommandExecutionEvent` and `AgentToolEvent` each own a bordered box. Consecutive completed tool calls therefore remain separate boxes.

F-129 groups consecutive protocol diagnostics by combining their text into one canonical event. Tool calls cannot use that approach because each call must retain its own type, identity, input, output, status, and expandable details.

## implementation details

- Treat these events as tool calls: `commandExecution`, `fileChange`, `mcpToolCall`, `dynamicToolCall`, `collabAgentToolCall`, `webSearch`, `imageView`, and Claude event types beginning with `tool.`. Reasoning, plan, diagnostic, and system events are not tool calls.
- Define a completed tool-call sequence as two or more adjacent canonical entries that are tool calls with `status: completed`. Any message, non-tool event, or tool call with another status ends the sequence, even when that boundary event is hidden from the chat.
- Build render groups from `conversation.entries` in stored order before applying event visibility. Keep one completed tool call in its existing standalone box; render each completed sequence in one bordered group.
- Add a completed-tool-call group component. It renders one row per call in original order, separates rows with theme `divider` borders, and lets each row expand independently to show its existing command, input, output, duration, and exit-code details.
- Reuse `CommandExecutionEvent` and `AgentToolEvent` content and controls. Add grouped presentation only where those components need to omit their own outer border; standalone running, failed, and declined events keep current styling and error emphasis.
- Keep canonical conversation data, persistence, provider identities, lifecycle replacement, transcript handoff, and desktop normalization unchanged. Grouping is only a React render projection.
- Use the first call's identity as the group key. When an adjacent running call completes, append it to the existing group without duplicating or reordering either call.
- Add chat tests for mixed tool types, independent detail expansion, sequence boundaries, hidden-event boundaries, running-to-completed updates, failed and declined calls, and preserved source order. Keep the render-stability test proving unchanged rows do not rerender during streaming.

## acceptance criteria

- Two or more adjacent completed tool calls render inside one bordered group, in canonical conversation order.
- A single completed tool call retains its current standalone presentation.
- Running, started, and in-progress tool calls remain individual boxes and show `Running`.
- Failed and declined tool calls remain individual error-emphasized boxes.
- Messages, reasoning, plan, diagnostic, system, and non-completed tool events split completed tool-call groups, including when the boundary event is hidden.
- Each grouped call retains its label and independently accessible details, including available command, input, output, duration, exit code, and working directory.
- A tool call changing from running to completed joins an adjacent completed group without duplication or order changes.
- Persisted conversations and agent handoff context retain separate tool-call events with unchanged identities and content.
