---
author: 
id: B_248
internalId: bf77e6ca-2917-4aff-804c-81ff1cdcab6b
title: new codex model is producing unknown agent events
status: design
owner: 
affects:
agents:
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