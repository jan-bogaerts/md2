---
author: 
id: B_151
internalId: 12faf0b2-355c-4860-b04b-6d5523a5c137
title: issues in stats
status: new
owner: 
affects:
agents:
policy:
---
* in legend and bar labels, action labels: don't include internal id, just the name of the action
* stacks are horizontally centered. that looks like shit, impossible to compare values. bars should be aligned at the bottom. this is in
  * activity over time.
  * project activity (which is the same as above
* bars have different widths on different charts. this is no good. they should all share the same basic styling
  best styling seems to be on 'agent/model performance', except when there are 2 bars on the same x tick (day/week). bars should half and tick width should stay the same, instead of increasing the tick width
* on 'agent/model performance', bars start at half of the chart, they need to start at the bottom (width padding of course)
* project usage vs account usage:
  * use 'vs' instead of 'versus' in the label
  * project activity needs to go to the bottom, last chart
  * account usage:
    * at top
    * has a light blue or gray bar for every day. what is the purpose of that&#x20;
    * we have filters: provider, limit that only appears to be applied to this chart, but they make no sense. the point is to view claude and codex side by side on the same day
    * missing day labels on the x axis like the other charts have