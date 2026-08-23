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
after: 47a847c9-cf6e-4a8a-823c-6a6b012bb21a
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