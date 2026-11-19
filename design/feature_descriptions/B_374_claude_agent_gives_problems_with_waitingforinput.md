---
author: 
id: B_374
internalId: 1f4193b2-d04c-4ade-8628-de3072d3692c
title: claude agent gives problems with waitingForInput
status: ready
owner: 
affects:
agents:
  - design/activity/card__1f4193b2-d04c-4ade-8628-de3072d3692c.json
policy:
after: 7f47e34c-9a6a-44c7-8ed7-3316d963780e
---
I have several claude agents that printed a last message that is clearly a question (open question, so not structured, but just a final response containing a question sentence). Yet the system did not correctly detect that the agent is now waiting for a response, the UI (action popup) still indicates that the agent is running: so the button's border is spinning and we are still showing the 'stop' button.

something is going wrong here.

## Investigation

This is a known Claude Code issue. In stream-JSON mode, Claude can emit its final assistant message but omit the terminal `result` event and remain running. MD² currently depends on that event to change a streaming conversation from `running` to `waitingForInput`, so the UI continues to show the running state.

Upstream report: [https://github.com/anthropics/claude-code/issues/39700](https://github.com/anthropics/claude-code/issues/39700)