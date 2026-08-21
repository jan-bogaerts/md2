---
author: 
id: F_233
internalId: 2809caf7-2f00-4484-ba68-18306e01f965
title: statst improvements
status: new
owner: 
affects:
agents:
policy:
---
* agent/model performance:
  * we currently have metrics: measured duration, tokens and toolcalls.
    I believe these are all totals. this is fine, but we should also have average info. so add an extra select after 'metric' where the user can select: sum, average, average with stdev, mean. for average with stdev, we can draw a range on top of the bar?
    average should be per action.
  * currently all numbers are displayed above the bars, but the are truncated, the text can only be as wide as the bar. can we allow them to go wider and keep the text centered with the bar.
  * we need to determine if the current calculation is per action or per card cause it is not so clear.
*