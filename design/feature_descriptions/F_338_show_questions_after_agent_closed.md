---
author: 
id: F_338
internalId: 48eca8bf-b156-40bb-99cf-134b5d6fa640
title: show questions after agent closed
status: design
owner: 
affects:
agents:
  - design/activity/card__48eca8bf-b156-40bb-99cf-134b5d6fa640.json
policy:
---

When an agent asked a question, we show a box with the questions. this works ok. only problem, when we close the application and open it again (so the agent has stopped), we don't show the questions anymore.

so, when the last message was a `askuserquestion` and the conversation is in the state `waitingforinput`, we should show the question box again.