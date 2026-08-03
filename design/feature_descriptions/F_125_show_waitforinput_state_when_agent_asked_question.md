---
author: 
id: F_125
internalId: e6a79155-179c-46bb-b31e-722dffd7ec2e
title: show waitforInput state when agent asked question
status: design
owner: 
affects:
agents:
  - design/activity/card__e6a79155-179c-46bb-b31e-722dffd7ec2e.json#conversation=agent-812f3b6c-7d5b-4625-b447-b67498854b9f
policy:
after: 
---

When the agent is waiting for regular input, we show the `run` button in a special state (orange, with indicator). We should do the same if the agent asked a specific question or asked for permission for something