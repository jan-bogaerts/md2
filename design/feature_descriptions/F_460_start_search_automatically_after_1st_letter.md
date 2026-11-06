---
author: 
id: F_460
internalId: 408e6af2-abc8-4f00-b4a5-59b908b8256b
title: start search automatically after 1st letter
status: design
owner: 
affects:
agents:
policy:
---

all search components (global search and the local searches) currently work on the principle that the search starts after pressing enter.

We should improve this by starting the search after the first letter has been entered, but with a short delay, so that, while the user is typing, we wait, once he pauses, the search starts automatically. If he continues to type, we do the delay again until he stops typing so we can do the search again.