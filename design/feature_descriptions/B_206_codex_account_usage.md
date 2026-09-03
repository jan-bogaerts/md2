---
author: 
id: B_206
internalId: 421a382c-ec00-4741-a8f7-eab2a949fcfe
title: codex account usage
status: new
owner: 
affects:
agents:
policy:
after: f5e9bc66-ebde-41f7-ae6e-503e9e8e284a
---

we already put a filter on the 'account usage' for codex, but it appears to have been done wrong. instead of only allowing 'codex', it appears it is filtering away the exact item we had at that time and letting everything else pass. wrong approach, we only want to let 1 item through.