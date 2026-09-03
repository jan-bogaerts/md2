---
author: 
id: B_164
internalId: ed8ce460-5ff7-46f0-8bf2-09764585b8b2
title: multiple remote-control connection was replaced
status: new
owner: 
affects:
agents:
  - design/activity/card__ed8ce460-5ff7-46f0-8bf2-09764585b8b2.json
policy:
after: 64640333-ea8c-4d4f-b2a4-2d32e74f7545
---
Once the error 'remote-control connection was replaced' is shown, it comes back at a regular interval. seems like the websocket is not stable.

We have myltiple bug repirts for this. See B\_141 'RemoteControlConnectionError: Remote-control connection was replaced'

This occurs on mobilz for instance when app was not in foreground or screen went off.

Once the websocket connection got dropped, only a full reload of the page helps, otherwise the connection remains unstable.

So, the reconnect is wrong. We also need to look at how spread out the reconnects are in the code.

I rhink this will be about the algorithm used and not about adding retries or anything