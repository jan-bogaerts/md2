---
author: 
id: F_223
internalId: 2bdcda91-18c2-42ea-8ebb-1208250a4d42
title: Collaps failed tool calls
status: new
owner: 
affects:
agents:
  - design/activity/card__2bdcda91-18c2-42ea-8ebb-1208250a4d42.json
policy:
after: e04c89e9-d394-435f-8f13-7d4bb9e942ff
---

We currently keep failed tool calls out of the tool call group. Lets skip this, so simplify grouping, group all, no matter if failed or not. Keep red color though for failed ones and add an 'errors' count in the toolcallsgroup header, if any, behind total count