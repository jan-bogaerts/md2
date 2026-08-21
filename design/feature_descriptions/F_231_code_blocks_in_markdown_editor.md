---
author: 
id: F_231
internalId: 859bf6d9-e791-45d3-b1de-774bb7daef32
title: code blocks in markdown editor
status: new
owner: 
affects:
agents:
policy:
after: 55de27a5-aa12-4048-9990-970a8382c5b2
---

* currently we only support inline code blocks. there is something annoying about them, noticed in lib version 4.0.4: when code block at end of text or end of line, and code block is closed, sometimes the cursor refuses to go out of the code block: all newly entered text remains in the code block. this is annoying and should be fixed somehow.
* need to add support for multi line code blocks