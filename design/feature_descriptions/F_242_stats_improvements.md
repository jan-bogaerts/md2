---
author: 
id: F_242
internalId: 9823580d-2b15-4386-9be1-66a94937fb3a
title: stats improvements
status: new
owner: 
affects:
agents:
policy:
---
* project usage vs account usage
  * keep same colors for same agents. lets prepare 2 sets of colors that differ enough (subset of the already created chart colors). for claude a set and for codex another set and always pick the colors sequentially, not randome. this way, we always have the same colors for the same agent or model, makes it easier to read the chart.
  * we already made the legends sticky to the left, but the titles should do the same.
  * we currently have an extra filter 'token values' with `average per action` and `totals` This is only applied to 'project token usage'
    instead of using a filter, lets just split this chart in 2, so we have 2 charts in the list: project token usage totals and project usage average per action. this way we can remove the filter.
  * since we have average token usage per action, per agent, we can also show 'average cost per action per agent', similar like we show 'tokens per dollar'
    and similar to 'project activity' and 'project token usage totals', we can also show 'total cost per agent per day?
* totals by card/action:
  * we show a tooltip per bar, good, but it shouldn't contain the path of the file of the card, just:
    {id}:{title}
    {value}&#x20;
    if value is time based, convert it to HH:MM:SS