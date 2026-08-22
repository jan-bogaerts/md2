---
author: 
id: B_173
internalId: a92474df-227a-480d-80db-2ba673c14c2c
title: error switch markdown history
status: new
owner: 
affects:
agents:
policy:
---

Uncaught Error Error: Cannot switch Markdown history before editor is attached
at switchDocument (c:\Users\janbo\Documents\dev\md2\app\src\components\editor\markdown\_document\_history\_store.ts:120:28)
at applyPendingDocumentChange (c:\Users\janbo\Documents\dev\md2\app\src\components\editor\markdown\_document\_history\_monitor.tsx:41:26)
at handleActiveDocumentChanged (c:\Users\janbo\Documents\dev\md2\app\src\components\editor\markdown\_document\_history\_monitor.tsx:49:13)
at setActiveTarget (c:\Users\janbo\Documents\dev\md2\app\src\components\editor\markdown\_data\_source.ts:88:14)
at setBoardDocument (c:\Users\janbo\Documents\dev\md2\app\src\components\editor\card\_markdown\_data\_source.ts:151:14)
at \<anonymous> (c:\Users\janbo\Documents\dev\md2\app\src\components\card\_view\card\_body\_popover.tsx:163:24)
at react\_stack\_bottom\_frame (localhost꞉5173/node\_modules/.vite/deps/react-dom\_client.js?v\=674ad62a:12906:5)
at runWithFiberInDEV (localhost꞉5173/node\_modules/.vite/deps/react-dom\_client.js?v\=674ad62a:851:66)
at commitHookEffectListUnmount (localhost꞉5173/node\_modules/.vite/deps/react-dom\_client.js?v\=674ad62a:6642:149)
at commitHookPassiveUnmountEffects (localhost꞉5173/node\_modules/.vite/deps/react-dom\_client.js?v\=674ad62a:6655:55)
at commitPassiveUnmountEffectsInsideOfDeletedTree\_begin (localhost꞉5173/node\_modules/.vite/deps/react-dom\_client.js?v\=674ad62a:7864:7)



we recently upgraded the mdxEditor component. we had to fix a bug where the prompt was no longer shown in the markdown editor of the action editor. This was fixed, but I believe since then, we get this error sometimes