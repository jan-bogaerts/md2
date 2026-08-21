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
after: 10a50270-fcab-4661-9d29-d966aa99eb1e
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