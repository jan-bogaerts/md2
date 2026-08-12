---
author: 
id: F_176
internalId: 6874b231-0cef-4a8a-8b0b-cc91f3daff42
title: change accept to serve and simplify
status: design
owner: 
affects:
agents:
policy:
---

We currently have a button 'accept' on the app bar. This should be relabeled to 'serve'.

Second, when the application starts the http server and shows the popup with the connection string and qr-code, the url has a session key. without that key, it is impossible to connect. this is a bit annoying cause now it becomes hard to set bookmarks.

remove the key and simplify the http server.