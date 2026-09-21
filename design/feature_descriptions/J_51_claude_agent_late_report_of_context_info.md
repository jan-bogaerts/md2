---
author: 
id: J_51
internalId: 9765373d-71ce-4870-91f2-c00af3cc1d5b
title: claude agent late report of context info
status: design
owner: 
affects:
agents:
policy:
---
on the action popup, we show the running state, token count and used context info all on the same row at the bottom of the chat history.

for the claude agent we only seem to report the context size that has been already used, after the conversation is done. can we improve this? can it already be shown while the conversation is still running