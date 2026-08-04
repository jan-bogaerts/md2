---
author: 
id: F_139
internalId: 02a44ecf-5974-4822-8e07-8a00f2c889c8
title: better handling of model reporting
status: new
owner: 
affects:
agents:
policy:
---

when codex starts, it appears to send an 'unknown agent event' containing something like this:

> codex --model gpt-5.6-sol -c model_reasoning_effort=medium --sandbox workspace-write --ask-for-approval on-request app-server --stdio

it looks like the selected model and other parameters.

either this is a bug or something, or perhaps we can use this to update the `action agent selectors` on the action-popup