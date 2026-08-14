---
author: 
id: F_172
internalId: 2b696eca-93cd-48b1-a237-b3cb9658e1d8
title: Reasoning block with text
status: design
owner: 
affects:
agents:
  - design/activity/card__2b696eca-93cd-48b1-a237-b3cb9658e1d8.json#conversation=agent-c5226a92-1d97-4a04-a71c-b6302eacfb75
policy:
---
Some reasoning blocks have text. We display that text while the reasoning is still active. however, once the reasoning is done, we hide the reasoning block. This should be changed:

* only hide the block if there is no text
* if there is text, collapse it. user can still expand it again to look at the text.