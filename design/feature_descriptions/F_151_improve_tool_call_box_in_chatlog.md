---
author: 
id: F_151
internalId: d078e271-bd1a-4a6d-86a0-d9cf3264c7e0
title: improve tool-call box in chatlog
status: design
owner: 
affects:
agents:
  - design/activity/card__d078e271-bd1a-4a6d-86a0-d9cf3264c7e0.json#conversation=agent-a4b8f91e-07ee-4fe6-8e43-243421de2669
policy:
---

in [F\_137\_group\_toolcalls.md](design/releases/0_1_0/F_137_group_toolcalls.md) we already implemented grouping of tool calls in the chatlog. only issue: all tool calls are still in their own box, the boxes are now just aligned so they touch each other.

we don't want that, we just want 1 single box that says:

`tools called` or something similar. This box can be expanded, then we get the individual tools that were called. each individual tool can also be expanded to see the details.

## Current state

`buildActionConversationRenderGroups` groups each visible run of at least two adjacent completed tool calls. A run is a sequence of completed tool-call events uninterrupted by a visible message or non-completed event; completed reasoning is hidden before grouping and therefore does not split the run. Single completed calls and all running, failed, or declined calls remain standalone.

`CompletedToolCallGroup` renders one outer border, but immediately renders every call through `ActionConversationEventRow`. Dividers make those rows touch, so the result still looks like several tool-call boxes instead of one summary box. Each row independently expands through `AgentToolEvent` or `CommandExecutionEvent` to show its details.

## implementation details

- Keep canonical conversation entries and `buildActionConversationRenderGroups` grouping rules unchanged. This feature changes presentation only.
- Render each multi-call group as one collapsed summary box labelled `Tools called (N)`, where `N` is number of calls in that group.
- Make summary header a button with visible expand/collapse affordance and accurate `aria-expanded` state.
- When summary expands, render calls in canonical conversation order as compact rows inside same outer box. Separate rows with divider hairlines; do not give each row its own outer box.
- Keep each call row independently expandable. Expanding one call reveals existing command or generic-tool details without collapsing group or changing expansion state of other calls.
- Preserve group and row keys based on existing event identities. When a running call completes and extends an existing multi-call group, mounted rows retain their expansion state and no call is duplicated.
- Keep single completed calls standalone. Keep running, started, in-progress, failed, and declined calls outside completed multi-call groups with existing lifecycle status and detail behavior.
- Use theme spacing, colors, borders, typography, and outlined MUI icons. Long summary or call text must truncate or wrap without horizontal chat overflow.
- Update chat rendering tests for collapsed summary, group expansion, nested independent detail expansion, grouping boundaries, live completion, accessible state, and unchanged standalone calls.

## acceptance criteria

- Every run containing at least two completed tool calls initially appears as one collapsed `Tools called (N)` box.
- Expanding summary shows every grouped call once, in original conversation order, inside same outer box.
- Each visible call can independently expand and collapse its existing details while summary remains expanded.
- Messages and visible non-completed events split groups; hidden completed reasoning does not split them.
- Single completed calls and non-completed calls remain standalone with existing status and detail behavior.
- A call that completes during live rendering can extend an existing adjacent multi-call group without duplication or loss of existing row expansion state.
- Summary and call controls expose accessible names and correct `aria-expanded` values.
- Group contents do not cause horizontal overflow in conversation chat.
