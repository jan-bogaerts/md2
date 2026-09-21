---
author: 
id: F_368
internalId: 530bdc1a-985f-434a-bfe7-acb2f7ca06b8
title: add mindmaps to diagrams
status: design
owner: 
affects:
agents:
policy:
---

we already have a number of different diagrams that we support. 1 more should be added: mindmaps.

These should support:

* nodes: text in a circle
* connections: curved line between nodes, the line should always be behind the nodes if a node is in the way of the connection. a connection should also support text.

We should support both read-only, rendered by an agent as well as in edit mode.