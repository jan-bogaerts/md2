---
author: 
id: F_257
internalId: 4684225b-0d21-4c57-8691-3f2844f76ca6
title: size of usage_metrics.csv
status: new
owner: 
affects:
agents:
policy:
after: 9d5878e6-2d20-4574-971d-57dbd82eb389
---
the size of `usage_metrics.csv` can grow fast. we also only need this info per release. so once a release is done, we should move this file into the release folder and use a new, csv for the next release.

this is a bit tricky though cause some cards that are not yet released might already have run some agents, so some usage-metrics are for cards that are released, others are not.

to solve this, we should probably work with a 'pre-calculated' data set.&#x20;

right now, we load all statistics dynamically when we show the stats view. better would be to save those statistics per card so we don't need to always recalculated them. and then append new data next time.

This way at release we can find the point in the csv file where all lines can be removed cause all cards in that time period have been released or archived.