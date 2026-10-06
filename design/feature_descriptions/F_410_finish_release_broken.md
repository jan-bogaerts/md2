---
author: 
id: F_410
internalId: 7df9f053-e015-45b7-ba7a-9f4f0945ef60
title: finish release broken
status: design
owner: 
affects:
agents:
policy:
---
after running 'finish release' we get a lot of these errors:

`Some agent conversations could not be loaded and were skipped: design/activity/card__945c9334-4a6a-4f98-b59e-38aaa853b5e6.json`

this is not normal. why is this happening, how to fix it?



internally we get errors like:

```&#x60;&#x60;&#x60;

Error: Malformed activity file: missing origin
    at rehydrateBridgeError (c:\Users\janbo\Documents\dev\md2\app\src\data\bridge_error_rehydration.ts:15:19)
    at unwrapBridgeResult (c:\Users\janbo\Documents\dev\md2\app\src\data\bridge_error_rehydration.ts:28:11)
    at unwrapBridgePromise (c:\Users\janbo\Documents\dev\md2\app\src\data\bridge_error_rehydration.ts:38:12)
    at async http://localhost:5173/src/services/agents/agent_integration.ts?t=1791299098775:39:26
    at async runConcurrentMapWorker (c:\Users\janbo\Documents\dev\md2\app\src\services\concurrency.ts:14:39)
    at async Promise.all (index 0)
    at async mapWithConcurrency (c:\Users\janbo\Documents\dev\md2\app\src\services\concurrency.ts:29:5)
    at async resolveCardConversations (c:\Users\janbo\Documents\dev\md2\app\src\services\agents\agent_integration.ts:74:21)
    at async AgentIntegration.resolveAndAttachAgentConversations (c:\Users\janbo\Documents\dev\md2\app\src\services\agents\agent_integration.ts:487:26)
    at async AgentIntegration.ensureAgentConversationsForCard (http://localhost:5173/src/services/agents/agent_integration.ts?t=1791299098775:260:9) {name: 'Error', stack: 'Error: Malformed activity file: missing origi…s/agent_integration.ts?t=1791299098775:260:9)', message: 'Malformed activity file: missing origin'}
```