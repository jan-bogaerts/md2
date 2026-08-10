---
author: 
id: F_153
internalId: 05d5d49c-401f-42cd-b3cc-074e169631dd
title: action part in approval required
status: ready
owner: 
affects:
agents:
  - design/releases/0_2_0/card__05d5d49c-401f-42cd-b3cc-074e169631dd.json#conversation=agent-2322e64a-9c75-4d08-b6cd-9b3d966b498b
  - design/releases/0_2_0/card__05d5d49c-401f-42cd-b3cc-074e169631dd.json#conversation=agent-793ef4cc-80b6-453e-a264-fc5869fdf065
  - design/releases/0_2_0/card__05d5d49c-401f-42cd-b3cc-074e169631dd.json#conversation=agent-8c17453c-e11e-4036-9992-e69494242a23
policy:
after: d078e271-bd1a-4a6d-86a0-d9cf3264c7e0
---
This is the text shown in the drawer shown when an agent requests for approval:

> Approval required
> Allow changing only F_151 source feature status from 
>
> `ready for implementation`
>
>  to 
>
> `ready`
>
>  in sibling md2 repository?

> Provider
> codex
> Command
> "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -Command '$featurePath = '"'C:\Users\janbo\Documents\dev\md2\design\feature_descriptions\F_151_improve_tool_call_box_in_chatlog.md' "'$content = [System.IO.File]::ReadAllText($featurePath) $updatedContent = [System.Text.RegularExpressions.Regex]::Replace($content, '"'(?m)"'^status: ready for implementation'"\r?"'$'"', 'status: ready', 1) if ("'$updatedContent -eq $content) { throw '"'Expected feature status was not found.' } "'$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false) [System.IO.File]::WriteAllText($featurePath, $updatedContent, $utf8WithoutBom)'
> Working directory
> C:\Users\janbo\Documents\dev\md2_workers\dev2
> Environment
> local
> Actions
> $featurePath = 'C:\Users\janbo\Documents\dev\md2\design\feature_descriptions\F_151_improve_tool_call_box_in_chatlog.md'
> $content = [System.IO.File]::ReadAllText($featurePath)
> $updatedContent = [System.Text.RegularExpressions.Regex]::Replace($content, '(?m)^status: ready for implementation\r?$', 'status: ready', 1)
> if ($updatedContent -eq $content) { throw 'Expected feature status was not found.' }
> $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
> \[System.IO.File]::WriteAllText($featurePath, $updatedContent, $utf8WithoutBom)



This is very long. now 'command' is already displayed with `...` but not `actions`, this should also use ...

next, drop `provider`, we already know this. `environment` local, is there another value possible? don't think so, so drop it.&#x20;

## Current state

`approvalDetails()` in `action_agent_approval.tsx` builds an ordered list of detail rows from the `LiveAgentApproval` object. It unconditionally pushes a `Provider` row when `approval.provider` is set, and an `Environment` row when `approval.environmentId` is set. Both rows always appear if the fields are present.

`Command` already has expand/collapse behavior: the row renders as a button; when collapsed the value shows on one line with CSS `text-overflow: ellipsis` and `white-space: nowrap`; clicking expands to `white-space: pre-wrap` and `overflow-wrap: anywhere`. State is tracked in a component-level `commandExpanded` boolean.

`Actions` has no such toggle. Each item in the `commandActionLabels` array is rendered as a plain `<Box component="code">` with `white-space: pre-wrap` and `overflow-wrap: anywhere`, so all items are always fully visible regardless of length.

## Implementation details

- In `approvalDetails()`, remove the `Provider` push (`if (approval.provider) ...`) entirely. Never show it.
- In `approvalDetails()`, remove the `Environment` push (`if (approval.environmentId) ...`) entirely. Never show it.
- Add an `actionsExpanded` boolean state (default `false`) alongside the existing `commandExpanded` state.
- In the render loop, when `label === 'Actions'`, wrap the values block in a toggle section: attach a click handler that toggles `actionsExpanded`, and set `aria-expanded` on the toggle control.
- When `actionsExpanded` is false, each action item renders with `white-space: nowrap` and `text-overflow: ellipsis` (one line per item, text cut with ellipsis). When true, each item renders with `white-space: pre-wrap` and `overflow-wrap: anywhere` (full text). Use the same CSS shape as the Command toggle.
- The toggle affordance sits on the `Actions` label row (caption level), not on individual items. One click expands or collapses all items together.
- Command expand/collapse is unchanged.

## Acceptance criteria

- `Provider` row never appears in the approval drawer, even when `approval.provider` is set.
- `Environment` row never appears in the approval drawer, even when `approval.environmentId` is set.
- `Actions` section is collapsed by default: each action item shows on a single line truncated with ellipsis.
- Clicking the `Actions` toggle expands all items to full text simultaneously.
- Clicking the toggle again collapses all items back to single-line ellipsis.
- The `Actions` toggle control exposes correct `aria-expanded` (`false` collapsed, `true` expanded).
- `Command` expand/collapse behavior is unchanged.