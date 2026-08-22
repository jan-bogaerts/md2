---
author: 
id: B_173
internalId: d9aa7d07-b618-4b83-9802-799c88174fb5
title: stats crypto randomUUID not supported in browser
status: new
owner: 
affects:
agents:
policy:
after: db4400c0-0d7f-4265-8939-8b4e493c7208
---

Apparently the stats view somewhere uses `crypto.randomUUID` . When we run the app in a browser (ex through websockets), we get this error: crypto.randomUUID is not a function

this needs to be fixed. we have had this before. perhaps we can make a note somewhere that we shouldn't use the crypto lib in the react app?