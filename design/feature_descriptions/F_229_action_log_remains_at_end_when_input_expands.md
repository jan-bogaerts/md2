---
author: 
id: F_229
internalId: de77178e-987f-437c-9af3-81b704eca3d4
title: action log remains at end when input expands
status: new
owner: 
affects:
agents:
policy:
after: ae7bdbef-7d85-4837-ba58-6ab382b218b0
---

In the action popup, when the user enters some text in the input editor, we expand the editor so there is more room for entering text. this all works fine.

There is just 1 annoying thing: when the chatlog was scrolled to the end, expanding the input doesn't keep the log scrolled to the end, it jumps up a little. would be better if the chatlog remained scrolled to the end. of course, if it wasn't scrolled to the end, then we can leave it as it was.