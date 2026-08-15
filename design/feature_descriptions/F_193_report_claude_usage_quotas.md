---
author: 
id: F_193
internalId: 8a177e01-b5d4-46aa-b42f-9ba11f561b60
title: report claude usage quotas
status: design
owner: 
affects:
agents:
  - design/activity/card__8a177e01-b5d4-46aa-b42f-9ba11f561b60.json#conversation=agent-1149b713-1757-4b41-9b70-8f1f24b4de99
policy:
after: 4191dc0a-7628-45bf-ada1-b1366e9f05f9
---

we are already reporting usage limits for codex in the apps status bar. we need to provide similar information from the claude cli.

options we were given:

* Claude's normal requests expose rate-limit information. For example, claude -p --output-format stream-json --verbose can emit events like:

  \`\`\`json
  {
  "type": "rate\_limit\_event",
  "rate\_limit\_info": {
  "status": "...",
  "resetsAt": 1778193600,
  "rateLimitType": "five\_hour"
  }
  }
  \`\`\`
* running claude interactive and send a `/usage` string should report something like:

  \`\`\`
  Current session
  34% used
  Resets 10:00pm

Current week (all models)
21% used
Resets Aug 10
\`\`\`



lets see which one works