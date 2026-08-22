---
author: 
id: F_241
internalId: 573854b5-fd44-4868-918e-56fdb505a905
title: track file changes for claude
status: new
owner: 
affects:
agents:
policy:
---

for Codex, we track the file changes that are reported by the cli. these values are shown on the UI in the action popup.

However, it seems we don't do this for claude.

so we need to investigate which messages we need to track, extract the values, store them in the activity and show them on the UI.

Since this feature already exists for codex, we need to be careful and make certain that we share functionality where possible.

we should also try to make it fairly generic for the consumers of the data. What I mean: we shouldn't have agent specific code at all levels of the algorithm.