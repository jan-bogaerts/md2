---
author: 
id: F_217
internalId: 9b601eb4-e385-404f-9059-07823b25b6fd
title: approval required too long
status: new
owner: 
affects:
agents:
policy:
after: 902e08a9-8b29-4037-ab3d-92d53aef4fc8
---
Approval required
Tool
PowerShell
Input
{
"command": "npm test -- src/actions/agent/claude\_usage 2>&1 | Select-Object -Last 25",
"timeout": 300000,
"description": "Run claude usage tests"
}
Session permission suggestions
{
"type": "addRules",
"rules": \[
{
"toolName": "PowerShell",
"ruleContent": "npm test -- src/actions/agent/claude\_usage 2>&1"
}
],
"behavior": "allow",
"destination": "localSettings"
}