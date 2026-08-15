---
author: 
id: F_194
internalId: 4191dc0a-7628-45bf-ada1-b1366e9f05f9
title: track token usage vs usage metrics
status: design
owner: 
affects:
agents:
  - design/activity/card__4191dc0a-7628-45bf-ada1-b1366e9f05f9.json#conversation=agent-f7050ad6-e92d-484f-ac8a-8365aff70325
policy:
after: dffba4e6-6ec5-4a40-8ee7-e68d4891aff3
---

we are currently already counting the tokens used by a project. we track this pretty granularly, but always related to the project: global total, per card, per action.

we also report 'account limits'. currently already working for codex, soon for claude likely too (see [F\_193\_report\_claude\_usage\_quotas.md](design/feature_descriptions/F_193_report_claude_usage_quotas.md) )

now we want to measure and save both values (deltas) over time so we can track: how many tokens were used per hour, per day, per week and how much account limits shrank in the same period, so how much account usage there was.

This allows us to check how the relationship is between token usage and account usage at various hours and days.

info should be saved in a csv file in the project folder