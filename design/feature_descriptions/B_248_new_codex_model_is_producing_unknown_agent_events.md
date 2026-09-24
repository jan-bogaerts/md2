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