---
author: 
id: F_223
internalId: 2bdcda91-18c2-42ea-8ebb-1208250a4d42
title: Collaps failed tool calls
status: new
owner: 
affects:
agents:
policy:
after: a2f851ba-744e-4b53-bc9b-33e1eaa6787a
---

We currently keep failed tool calls out of the tool call group. Lets skip this, so simplify grouping, group all, no matter if failed or not. Keep red color though for failed ones and add an 'errors' count in the toolcallsgroup header, if any, behind total count