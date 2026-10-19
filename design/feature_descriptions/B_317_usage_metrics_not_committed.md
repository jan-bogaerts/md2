---
author: 
id: B_317
internalId: 35e2668b-44b4-4be8-9a82-cc3c7f2b4003
title: usage_metrics not committed
status: design
owner: 
affects:
agents:
policy:
---

we update [usage\_metrics.csv](design/usage_metrics.csv) on a regular basis in the project. but it does not seem to use the [commit\_batcher.ts](app/src/data/commit_batcher.ts) for committing the file?