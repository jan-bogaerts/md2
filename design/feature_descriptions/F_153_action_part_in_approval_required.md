---
author: 
id: F_153
internalId: 05d5d49c-401f-42cd-b3cc-074e169631dd
title: action part in approval required
status: design
owner: 
affects:
agents:
  - design/activity/card__05d5d49c-401f-42cd-b3cc-074e169631dd.json#conversation=agent-2322e64a-9c75-4d08-b6cd-9b3d966b498b
policy:
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