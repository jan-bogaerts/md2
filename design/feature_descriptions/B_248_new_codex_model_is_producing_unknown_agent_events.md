---
author: 
id: B_248
internalId: bf77e6ca-2917-4aff-804c-81ff1cdcab6b
title: new codex model is producing unknown agent events
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__bf77e6ca-2917-4aff-804c-81ff1cdcab6b.json
policy:
---
codex agent app was updated, it seems the messaging has been changed, perhaps also a couple of things got broken during refactoring:

* project agent does not show the context usage indicator, not tokens. it only shows the time it was running.
* while the agent is running, it does not show anything in the log. only at the end, it seems, it all comes through, with a lot of 'unknown agent events, which seem to be file edits or something.



This seems to be a project-agent issue first, messages seem to arrive ok, but are not handled correctly, the UI's project agent does not receive them correctly.&#x20;

small extract of messages we reveived:

> \[agent:raw] codex {"type":"thread.started","thread_id":"01a0d2db-82bc-7ab0-b60b-4826c218dcb4"}
> \[agent:raw] codex {"type":"item.completed","item":{"id":"item_0","type":"error","message":"Codex is ignoring 2 unrecognized configuration settings. Check for typos or deprecated settings.\n  user (C:\Users\janbo\\.codex\config.toml): 
>
> `multi_agent`
>
>  is ignored.\n  user (C:\Users\janbo\\.codex\config.toml): 
>
> `windows_wsl_setup_acknowledged`
>
>  is ignored."}}
> \[agent:raw] codex {"type":"item.completed","item":{"id":"item_1","type":"error","message":"Codex is ignoring 2 unrecognized configuration settings. Check for typos or deprecated settings.\n  user (C:\Users\janbo\\.codex\config.toml): 
>
> `multi_agent`
>
>  is ignored.\n  user (C:\Users\janbo\\.codex\config.toml): 
>
> `windows_wsl_setup_acknowledged`
>
>  is ignored."}}
> \[agent:raw] codex {"type":"turn.started"}
> \[agent:raw] codex {"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"I’ll map the remaining 1,800 lines by responsibility and trace how the session’s methods are called. Then I’ll propose a split that removes at least 1,000 lines without turning the service into a set of forwarding methods."}}
> \[agent:raw] codex {"type":"item.started","item":{"id":"item_3","type":"command_execution","command":""C:\\\Windows\\\System32\\\WindowsPowerShell\\\v1.0\\\powershell.exe" -Command 'rg -n "''^    (public |private |protected )?(static )?[a-zA-Z_][a-zA-Z0-9_]
>
> *'"\\\\(|"'^    (get |subscribe|get[A-Z]|set[A-Z]|add[A-Z]|remove[A-Z]|update[A-Z]|create[A-Z]|paste[A-Z]|reconnect[A-Z]|begin[A-Z]|end[A-Z]|start[A-Z]|discard|acknowledge[A-Z]|copy[A-Z]|cut[A-Z])" app/src/services/diagrams/diagram_edit_session_service.ts'","aggregated_output":"","exit_code":null,"status":"in_progress"}}
> \[agent:raw] codex {"type":"item.completed","item":{"id":"item_3","type":"command_execution","command":""C:\\\Windows\\\System32\\\WindowsPowerShell\\\v1.0\\\powershell.exe" -Command 'rg -n "''^    (public |private |protected )?(static )?[a-zA-Z_][a-zA-Z0-9_]*
>
> '"\\\\(|"'^    (get |subscribe|get[A-Z]|set[A-Z]|add[A-Z]|remove[A-Z]|update[A-Z]|create[A-Z]|paste[A-Z]|reconnect[A-Z]|begin[A-Z]|end[A-Z]|start[A-Z]|discard|acknowledge[A-Z]|copy[A-Z]|cut[A-Z])" app/src/services/diagrams/diagram_edit_session_service.ts'","aggregated_output":"","exit_code":0,"status":"completed"}}
> \[agent:raw] codex {"type":"item.started","item":{"id":"item_4","type":"command_execution","command":""C:\\\Windows\\\System32\\\WindowsPowerShell\\\v1.0\\\powershell.exe" -Command "rg -n \\"diagramEditSessionService\\\\.|\\\\.removeObjects\\\\(|\\\\.updateFragment\\\\(|\\\\.reconnectEdgeEndpoint\\\\(\\" app/src/components/diagram_view app/src/services/diagrams --glob '"'!
>
> *.test.*
>
> '"'"","aggregated_output":"","exit_code":null,"status":"in_progress"}}
> \[agent:raw] codex {"type":"item.completed","item":{"id":"item_4","type":"command_execution","command":""C:\\\Windows\\\System32\\\WindowsPowerShell\\\v1.0\\\powershell.exe" -Command "rg -n \\"diagramEditSessionService\\\\.|\\\\.removeObjects\\\\(|\\\\.updateFragment\\\\(|\\\\.reconnectEdgeEndpoint\\\\(\\" app/src/components/diagram_view app/src/services/diagrams --glob '"'!
>
> *.test.*
>
> '"'"","aggregated_output":"","exit_code":0,"status":"completed"}}
> \[agent:raw] codex {"type":"item.started","item":{"id":"item_5","type":"command_execution","command":""C:\\\Windows\\\System32\\\WindowsPowerShell\\\v1.0\\\powershell

> \[agent:raw] codex {"type":"item.completed","item":{"id":"item_8","type":"command_execution","command":""C:\\\Windows\\\System32\\\WindowsPowerShell\\\v1.0\\\powershell.exe" -Command '$p='"'app/src/services/diagrams/diagram_edit_session_service.ts'; Get-Content "'$p | Select-Object -Skip 1170 -First 445'","aggregated_output":"\r\n    createGroup(group: NewDiagramGroup): string | null {\r\n        const diagram = this.requireEditableDiagram()\r\n        let nodeIds: string[] = []\r\n        if (!this.validateOperation('Create group', () => {\r\n            validateNewGroup(group)\r\n            nodeIds = this.requireOwnedNodeIds(group.nodeIds)\r\n        })) return null\r\n        const id = this.generateObjectId((candidate) => this.groupsById.has(candidate))\r\n        const created: DiagramGroup = { ...group, id, nodeIds }\r\n        diagram.groups.push(created)\r\n        this.groupsById.set(id

> \[agent:raw] codex {"type":"item.completed","item":{"id":"item_10","type":"command_execution","command":""C:\\\Windows\\\System32\\\WindowsPowerShell\\\v1.0\\\powershell.exe" -Command 'Get-Content app/src/services/diagrams/diagram_save_service.ts | Select-Object -First 125'","aggregated_output":"import { register } from '../service_injector'\r\n        if (!editableDiagram || !originalDiagram || !editSession) throw new Error('Cannot save without an active diagram edit session')\r\n\r\n        const content = this.serialize(editableDiagram)\r\n        const savedDiagram = parseDiagramData(content)\r\n        const request: SaveEditedDiagramCopyRequest = {\r\n            content,\r\n            savedRecord: this.session.getSavedRecordSnapshot(),\r\n            sourceRecord: originalDiagram.record,\r\n        }\r\n        this.setStatus('saving')\r\n        try {\r\n            const record = await this.persistence.saveEditedDiagramCopy(request)\r\n            const currentSession = this.session.getSessionSnapshot()\r\n            if (currentSession?.sourceDiagramId === editSession.sourceDiagramId) {\r\n                const currentDiagram = this.session.getEditableDiagram()\r\n                const savedDataIsCurrent = !!currentDiagram && this.serialize(currentDiagra

> \[agent:raw] codex {"type":"turn.completed","usage":{"input_tokens":23603193,"cached_input_tokens":23289856,"cache_write_input_tokens":0,"output_tokens":74820,"reasoning_output_tokens":30314}}



so we get context usage, it is just not shown on the project agent. seems like a serious bug.

## Current state

The sample is from `codex exec --json` (a one-run JSON-line protocol), not the Codex `app-server` streaming protocol. `desktop/src/actions/agent/agent_provider_protocol.js` parses each line as it arrives, but creates provider events only for `item.completed`. Thus a running `command_execution` has no visible lifecycle entry. On completion, `agent_codex_event.js` rejects `command_execution` because its supported type is `commandExecution`; `agent_codex_events.js` instead creates a generic `tool.command_execution` transcript entry. The sample contains command executions, not evidence of file edits. Its `error` items are handled separately.

`turn.completed.usage` is parsed, but the one-run path applies those token totals to the conversation only when the process closes in `agent_runner_service.js`. `ConversationContextUsage` needs both used tokens and context-window capacity to draw a percentage. The sample has turn token totals but no capacity, so those totals alone cannot supply the missing indicator. The separate `app-server` path already handles live item events and `thread/tokenUsage/updated`, including capacity when Codex reports it.

## Implementation details

* In the one-run parser, normalize documented `codex exec` item names and fields at the protocol boundary: `command_execution`, `aggregated_output`, `exit_code`, and `in_progress` must reach the existing `commandExecution`, `aggregatedOutput`, `exitCode`, and `inProgress` event shape. Handle `item.started` and `item.completed` with the same `item.id`, so the runner's provider-event replacement updates one visible entry while the command runs and when it finishes. Preserve command, output, status, and exit code.
* Route recognized completed items through one canonical event path; do not also append a generic `tool.command_execution` entry. Keep assistant messages, warnings/errors, and genuinely unsupported items on their existing paths. Do not classify command output as a file change; only explicit file-change items may add changed paths.
* Keep `turn.completed.usage` as the authoritative token total for the one-run turn. Expose it to the live conversation when received, then persist it once on close; avoid double counting. Show a context percentage only when Codex supplies a valid used-token count and capacity. Never infer context occupancy from cumulative turn tokens or a guessed model limit.
* Add focused parser/runner regression tests using the supplied `thread.started`, `item.started`, `item.completed`, and `turn.completed` shapes. Check UI rendering with a running command, its completed replacement, token display, and absent or present context capacity. Keep separate streaming-protocol coverage intact.

## Acceptance criteria

* During a `codex exec --json` run, each supported `item.started` command appears in the project-agent log before its `item.completed` event; completion updates that entry with output and exit status. It does not create a second generic or unknown command entry.
* Assistant text and provider warnings/errors remain visible. Unknown item types remain diagnosable without being mislabeled as file edits; command events do not add changed paths.
* After `turn.completed.usage` arrives, displayed and persisted token totals match its counters exactly once, including cached and reasoning tokens. Closing the process does not add the turn again.
* Context-usage percentage appears when Codex reports valid used tokens and capacity. When capacity is absent, no percentage is shown and no value is guessed; token totals still appear.
* Focused one-run parser, runner, and conversation UI tests pass. Existing `app-server` live events and context usage still work.
