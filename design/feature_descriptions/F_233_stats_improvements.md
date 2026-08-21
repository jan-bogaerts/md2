---
author: 
id: F_233
internalId: 2809caf7-2f00-4484-ba68-18306e01f965
title: stats improvements
status: design
owner: 
affects:
agents:
  - design/activity/card__2809caf7-2f00-4484-ba68-18306e01f965.json
policy:
---
* agent/model performance:
  * we currently have metrics: measured duration, tokens and toolcalls.
    I believe these are all totals. this is fine, but we should also have average info. so add an extra select after 'metric' where the user can select: sum, average, average with stdev, mean. for average with stdev, we can draw a range on top of the bar?
    average should be per action.
  * currently all numbers are displayed above the bars, but the are truncated, the text can only be as wide as the bar. can we allow them to go wider and keep the text centered with the bar.
  * needs option to select which actions to include or all.&#x20;
* project usage vs account usage:
  * make the titles and legends sticky like in the other charts
  * currently all numbers are displayed above the bars, but the are truncated, the text can only be as wide as the bar. can we allow them to go wider and keep the text centered with the bar.
  * dates in the tooltips are just utc text i think, format them nicely to local time.
  * see tooltip: `21 Aug 2026, 02:00 – 22 Aug 2026, 02:00; UTC 2026-08-21T00:00:00.000Z to 2026-08-22T00:00:00.000Z; claude / default / weekly; 2642 percentage points; window 10080 minutes; reset 2026-08-23T17:00:00.000Z, 2026-08-23T16:59:00.000Z`
    this is just meaningless spaghetti
* project token usage:&#x20;
  * I think these are currently totals. that is ok, but it needs to say that these are totals
  * we need the ability to view totals and averages (per action)
* tokens per percent account usage:
  * tooltip: `21 Aug 2026, 02:00 – 22 Aug 2026, 02:00; UTC 2026-08-21T00:00:00.000Z to 2026-08-22T00:00:00.000Z; codex / codex / primary; 84343454 project tokens; 83 account percentage points; ratio 1016186.1927710844` again, poorly written. hard to read. 'percentage points' wtf?