---
author: 
id: F_412
internalId: e5a9c51e-b832-48b9-9e71-e83cc4468433
title: illegal forced switch to source mode
status: design
owner: 
affects:
agents:
policy:
---

we recently introduced source mode for the markdown editors. this appears to be giving unwanted side effects.

i tried to paste some text into the editor and we got this error:

`This content needs Source mode. The existing document is preserved; paste or insert it again in Source.`

and switched to source input.

* we showed this error, which is wrong
* it should not switch to source mode just like that

the text we tried to paste: