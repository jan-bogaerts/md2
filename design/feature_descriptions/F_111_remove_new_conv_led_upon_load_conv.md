---
author: 
id: F_111
internalId: 6fdba724-f0ab-484a-9831-0480bc6d5e8d
title: remove new conv-led upon load conv
status: new
owner: 
affects:
agents:
policy:
---

When an agent is finished, we show a small blue led on the 'action' button in the `action-popup`. This is ok. However, it remains there for as long as the action popup remains open. Also, the user initially gets to see an empty chat window, which is confusing. So:

* when an action completes while the chatlog of that action is active (so action-popup open and action button selected), then we should mark the log as `viewed`
* when the user clicks on an action button that has a log still marked as `ready but not yet viewed`, then instead of showing an empty log history, immediately open the last log (that is marked as ready, not yet viewed).
* as soon as the log is shown, remove the led from the action button. the log has been viewed, so lets show it this way.
*