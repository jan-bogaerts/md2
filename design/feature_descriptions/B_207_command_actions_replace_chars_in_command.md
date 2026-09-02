---
author: 
id: B_207
internalId: 711befe5-b3f9-400b-b077-2b44830c9e38
title: command actions replace chars in command
status: new
owner: 
affects:
agents:
policy:
---

it appears we are replacing characters that we entered in the command line of a command action. apart from replacing placeholders, we should not be doing this. so:

* why are we doing this
* where is it occuring
* are there other things done to the command line?

ex: input: `powershell.exe -NoProfile -File "C:\Users\janbo\Documents\dev\vidsy\tools\release_electron.ps1"`
actually executed: `powershell.exe -NoProfile -File "C:\Users\janbo\Documents\dev\vidsy\tools\release\_electron.ps1"`&#x20;