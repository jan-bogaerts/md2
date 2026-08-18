---
author: 
id: F_211
internalId: ad4126b2-1203-4a30-b222-636148bf92b1
title: stats view improvements
status: design
owner: 
affects:
agents:
policy:
after: 8624544e-9fd6-4a27-837c-95e504a2c5d6
---

* missing scrollbar, when there are many boxes, they are outside of the edge. needs horizontal and vertical (auto) scrollbars
* values are printed on top of each bar, but also the label, which is repeated for every box, not good, just print value, put label in a box left top (forgot name of list of definitions on chart)
* bottom row when activity over time: every box represents a day, week or month. this is ok, but there are no boxes for missing dates between bars. if a day/week/month has no values, it should have a box with value 0 on the chart.&#x20;
* use small date, not such a long text
* when grouped by card: use id only, show full title in tooltip.