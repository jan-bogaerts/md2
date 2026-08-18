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
after: 3ebc6426-47fe-41b8-bb66-da98818be9d9
---
in [F\_208\_add\_view\_stats.md](design/feature_descriptions/F_208_add_view_stats.md), we added support for stats view. this needs some improvement.

* missing scrollbar, when there are many boxes, they are outside of the edge. needs horizontal and vertical (auto) scrollbars
* values are printed on top of each bar, but also the label, which is repeated for every box, not good, just print value, put label in a box left top (legend)
* bottom row when activity over time: every box represents a day, week or month. this is ok, but there are no boxes for missing dates between bars. if a day/week/month has no values, it should have a box with value 0 on the chart.&#x20;
* use small date, not such a long text
* when grouped by card: use id only, show full title in tooltip.

Also need to improve data shown. Things we want to see

* Bar value: Average \[time, tokens, toolcall-count ] spend on any action per \[agent, model] \= nr of barsin each group, per \[week, day] \= x axis, groups&#x20;
* Activity over time, count actions, split bar up in actions, each action its own color, always the same for each bar, put in legend
* Per \[day, week] a bar per agent, value token usage vs account usage in %



So questions we want answered:

* Which \[agent, model] \[takes longest, uses most tokens] over all types of actions or specific actions over time
* Which agent´s account usage drains fastest, relatively to what gets accomplished