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
branch: b_248_new_codex_model_is_producing_unknown_agent_events
worktree: 3
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

Project conversations intentionally have `cardInternalId: null`; their scope is project context, and `AgentConversation.id` identifies each conversation. `ActionAgentInteraction` passes `usageValuesService` to the chat only for card contexts. `ActionUsageValuesService.recalculate` independently returns `null` unless context has a card ID and card file. Those two guards hide the token footer for every project conversation, even when token usage exists. `scopedActionUsage` also filters by a required card ID, and `ActionUsageSummary` labels that scope "Action/card".

The sample uses `codex exec --json` (a one-run JSON-line protocol). Its `turn.completed.usage` is parsed and applied to the conversation when the process closes; the missing card ID does not block that path. The circular context indicator uses `conversation.contextWindowUsage` separately, without a card-ID guard. It needs both used tokens and context-window capacity; the sample reports turn token totals but no capacity, so it cannot show a valid percentage from this sample alone.

The log issue has a separate cause: `agent_provider_protocol.js` ignores `item.started`, so running commands have no visible entry. On `item.completed`, `agent_codex_event.js` rejects `command_execution` because it expects `commandExecution`; `agent_codex_events.js` instead creates a generic `tool.command_execution` entry. The sample shows commands, not file edits. Raw lines have no timestamps, so they do not establish whether Codex or the UI delayed completed events.

## Implementation details

* Let project agent actions use `usageValuesService` in `ActionAgentInteraction`. In `ActionUsageValuesService` and `scopedActionUsage`, aggregate conversations by action ID plus project scope (`cardInternalId: null`) for project context; keep card aggregation keyed by `cardInternalId`. Update the footer's scope label to "Action/project" for project conversations. Do not assign a fake card ID.
* In the one-run parser, normalize `codex exec` item names and fields at the protocol boundary: `command_execution`, `aggregated_output`, `exit_code`, and `in_progress` must reach the existing `commandExecution`, `aggregatedOutput`, `exitCode`, and `inProgress` event shape. Handle `item.started` and `item.completed` with the same `item.id`, so the runner's provider-event replacement updates one visible entry while the command runs and when it finishes.
* Route recognized completed items through one canonical event path; do not also append a generic `tool.command_execution` entry. Keep assistant messages, warnings/errors, and genuinely unsupported items on their existing paths. Do not classify command output as a file change; only explicit file-change items may add changed paths.
* Keep `turn.completed.usage` as the authoritative token total for the one-run turn and persist it once on close. Show a context percentage only when Codex supplies valid used tokens and capacity; do not derive it from cumulative turn totals.
* Add project-context footer tests with `cardInternalId: null` and stored/live token usage, plus parser/runner tests using the sample's `item.started`, `item.completed`, and `turn.completed` shapes. Check separate card behavior and streaming-protocol coverage.

## Acceptance criteria

* A project conversation with `cardInternalId: null` shows token totals in its footer after usage is recorded, for both live and loaded conversations. Its action/project total includes only conversations of the selected action in project scope. Card totals remain scoped by card ID.
* During a `codex exec --json` run, each supported `item.started` command appears in the project-agent log before its `item.completed` event; completion updates that entry with output and exit status. It does not create a second generic or unknown command entry.
* Assistant text and provider warnings/errors remain visible. Unknown item types remain diagnosable without being mislabeled as file edits; command events do not add changed paths.
* After a one-run process closes, displayed and persisted token totals match `turn.completed.usage` exactly once, including cached and reasoning tokens.
* Context-usage percentage appears when Codex reports valid used tokens and capacity. When capacity is absent, no percentage is shown and no value is guessed; token totals still appear.
* Focused project-footer, one-run parser, runner, and conversation UI tests pass. Existing `app-server` live events and context usage still work.
