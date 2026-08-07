---
author: 
id: F_153
internalId: 05d5d49c-401f-42cd-b3cc-074e169631dd
title: action part in approval required
status: new
owner: 
affects:
agents:
policy:
---

This is the text shown in the drawer shown when an agent requests for approval:

Approval required
Allow changing only F\_151 source feature status from `ready for implementation` to `ready` in sibling md2 repository?

Provider
codex
Command
"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -Command '$featurePath \= '"'C:\Users\janbo\Documents\dev\md2\design\feature\_descriptions\F\_151\_improve\_tool\_call\_box\_in\_chatlog.md' "'$content \= \[System.IO.File]::ReadAllText($featurePath) $updatedContent \= \[System.Text.RegularExpressions.Regex]::Replace($content, '"'(?m)"'^status: ready for implementation'"\r?"'$'"', 'status: ready', 1) if ("'$updatedContent -eq $content) { throw '"'Expected feature status was not found.' } "'$utf8WithoutBom \= New-Object System.Text.UTF8Encoding($false) \[System.IO.File]::WriteAllText($featurePath, $updatedContent, $utf8WithoutBom)'
Working directory
C:\Users\janbo\Documents\dev\md2\_workers\dev2
Environment
local
Actions
$featurePath \= 'C:\Users\janbo\Documents\dev\md2\design\feature\_descriptions\F\_151\_improve\_tool\_call\_box\_in\_chatlog.md'
$content \= \[System.IO.File]::ReadAllText($featurePath)
$updatedContent \= \[System.Text.RegularExpressions.Regex]::Replace($content, '(?m)^status: ready for implementation\r?$', 'status: ready', 1)
if ($updatedContent -eq $content) { throw 'Expected feature status was not found.' }
$utf8WithoutBom \= New-Object System.Text.UTF8Encoding($false)
\[System.IO.File]::WriteAllText($featurePath, $updatedContent, $utf8WithoutBom)