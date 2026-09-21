---
author: 
id: B_243
internalId: 9765373d-71ce-4870-91f2-c00af3cc1d5b
title: claude agent is missing used context info
status: design
owner: 
affects:
agents:
policy:
---

on the action popup, we show the running state, token count and used context info all on the same row at the bottom of the chat history.

for the claude agent we no longer seem to report the context size that has been already used. this used to work I believe.