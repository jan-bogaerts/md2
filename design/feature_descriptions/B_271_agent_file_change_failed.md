---
author: 
id: B_271
internalId: 4e9bc413-979d-482d-ad59-48ff3b74b350
title: agent file change failed
status: design
owner: 
affects:
agents:
policy:
---

An agent modified a file and triggered this error:

> Error: Primary worktree changed after pending saves were flushed; save changes and retry integration
> at rehydrateBridgeError (c:\Users\janbo\Documents\dev\md2\app\src\data\bridge_error_rehydration.ts:15:19)
> at unwrapBridgeResult (c:\Users\janbo\Documents\dev\md2\app\src\data\bridge_error_rehydration.ts:28:11)
> at unwrapBridgePromise (c:\Users\janbo\Documents\dev\md2\app\src\data\bridge_error_rehydration.ts:38:12)
> at async WorktreeService.updateCardWorktree (c:\Users\janbo\Documents\dev\md2\app\src\services\project\worktree_service.ts:344:29)
> at async handleUpdateMenu (http://localhost:5173/src/components/worktree_selector.tsx?t=1791623808158:195:42) {name: 'Error', stack: 'Error: Primary worktree changed after pending…worktree_selector.tsx?t=1791623808158:195:42)', message: 'Primary worktree changed after pending saves… flushed; save changes and retry integration'}

what caused this and how to fix it?