---
author: 
id: F_217
internalId: 9b601eb4-e385-404f-9059-07823b25b6fd
title: approval required too long
status: design
owner: 
affects:
agents:
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