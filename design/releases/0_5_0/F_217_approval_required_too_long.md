---
author: 
id: F_217
internalId: 9b601eb4-e385-404f-9059-07823b25b6fd
title: approval required too long
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__9b601eb4-e385-404f-9059-07823b25b6fd.json
policy:
after: a0687111-dded-4140-8d97-666bd331ddfc
---
Approval required

```&#x60;&#x60;&#x60;
Tool
PowerShell
Input
{
"command": "npm test -- src/actions/agent/claude_usage 2>&1 | Select-Object -Last 25",
"timeout": 300000,
"description": "Run claude usage tests"
}
Session permission suggestions
{
"type": "addRules",
"rules": [
{
"toolName": "PowerShell",
"ruleContent": "npm test -- src/actions/agent/claude_usage 2>&1"
}
],
"behavior": "allow",
"destination": "localSettings"
}
```

can't we use 1 line (ex: value of first field) for input and if the user want to expand, show the entire text

also 'session permission suggestions' aren't they used to prefill the selection boxes? in that case, we don't need to show it at all, otherwise, can't we just use 'behavior' as the 1 line value and if the user wants to expand, he can see everything.

note: i'm not certain if this was for claude or codex, but both should behave similar when showing permission for approval&#x20;

## Current state

An **approval card** is the block `ActionAgentApproval` (`app/src/components/actions/agent/action_agent_approval.tsx`) renders in the action popup when a running agent asks permission before using a tool. `approvalDetails` builds an ordered list of labelled rows: Tool, Command, Working directory, Actions, Network, Requested permissions, Requested write root, Affected files, Input, Session permission suggestions.

Only two rows collapse today. `Command` and `Actions` are buttons with per-row expand state (`commandExpanded`, `actionsExpanded`); collapsed they use `whiteSpace: 'nowrap'` plus ellipsis, so they occupy one line. Every other row renders in full with `whiteSpace: 'pre-wrap'`.

`Input` is the whole tool input object, serialised by `structuredValueLabel` with `JSON.stringify(value, null, 2)`. For a PowerShell or Bash call that is four to eight pre-wrapped lines, and it repeats the `command` value already shown in the Command row. `Session permission suggestions` is the provider's suggestion array, serialised the same way, adding another multi-line JSON block. Together they make the card taller than the chat area, which is the reported problem.

The suggestions are never rendered as prefilled selection boxes, so displaying them buys the user nothing. In `desktop/src/actions/agent/agent_claude_streaming_adapter.js`, `claudeApprovalRequest` reads `permission_suggestions` from the Claude `can_use_tool` control request and uses it for exactly two purposes: a non-empty array adds `acceptForSession` to `availableDecisions` (the "Allow for session" button), and `claudeApprovalResponse` sends the array back verbatim as `updatedPermissions` when the user picks that decision. Nothing else reads it.

Provider difference: `permissionSuggestions` and `input` are Claude-only. Codex approvals are built in `agent_streaming_adapter.js` by spreading the JSON-RPC `params` of `item/commandExecution/requestApproval` and `item/fileChange/requestApproval`; they carry `command`, `cwd`, `commandActions`, `reason`, and file paths, but no `input` and no suggestions. So Codex already avoids the long rows, and the fix must keep both providers rendering through the same component and the same collapse rules.

## implementation details

* Remove the `Session permission suggestions` row from `approvalDetails`. Do not touch `AgentApproval.permissionSuggestions` in `app/src/data/action_run_types.ts`, nor the adapter: the field must keep driving `acceptForSession` availability and the `updatedPermissions` response payload.
* Make `Input` a collapsible row using the same per-row pattern as `Command` and `Actions`: new `inputExpanded` state, a toggle button with `aria-label="Toggle full input"` and `aria-expanded`, collapsed styling `whiteSpace: 'nowrap'` with `textOverflow: 'ellipsis'`, expanded styling `whiteSpace: 'pre-wrap'` with `overflowWrap: 'anywhere'`.
* Collapsed `Input` shows the value of the object's first field, in insertion order, as a single line. String value is printed as-is; non-string value is printed as compact single-line JSON (`JSON.stringify` without indentation). Empty object collapses to an empty line. Expanded `Input` shows today's full pretty-printed JSON, unchanged.
* Keep the three toggles independent; do not introduce a card-level "show details" control. Collapse state stays local component state and resets when a new approval mounts, which the existing per-approval `key` in `ActionAgentApprovals` already gives.
* Every row starts collapsed, including `Input`, matching current `Command`/`Actions` defaults.
* Leave the remaining rows (Tool, Working directory, Network, Requested permissions, Requested write root, Affected files) as they are: they are short by construction.
* Update `app/src/components/actions/agent/action_agent_approval.test.tsx`. The existing case `shows tool input and provider permission suggestions without provider or environment` asserts the suggestion JSON is visible and must be rewritten to assert its absence, plus collapsed/expanded input behaviour. Add a Codex-shaped approval case (no `input`, no suggestions) proving no input row and no empty toggle appears.

## acceptance criteria

* An approval card with permission suggestions renders no `Session permission suggestions` label and none of the suggestion JSON.
* Hiding the suggestions does not change decision buttons: an approval whose `permissionSuggestions` is non-empty still offers "Allow for session", and choosing it still returns the same `updatedPermissions` array to the provider.
* An approval with a multi-field `input` shows one `Input` line holding the first field's value, clipped with an ellipsis when it exceeds the width, and the card does not grow taller because of it.
* Clicking the `Input` line expands it to the full indented JSON and wraps long values; clicking again collapses it. `aria-expanded` tracks the state.
* `Command`, `Actions`, and `Input` expand and collapse independently; expanding one leaves the others collapsed.
* A Codex approval (command, cwd, actions, no input, no suggestions) renders unchanged apart from the removed suggestions row, and its `Command` and `Actions` rows still collapse as before.
* A newly arriving approval renders with all collapsible rows collapsed, regardless of what the user expanded on a previous approval.
