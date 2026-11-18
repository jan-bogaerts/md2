---
author: 
id: F_474
internalId: c8fdbf7f-e685-4590-8532-4103d2d68287
title: custom size for cards showing code diff
status: design
owner: 
affects:
agents:
policy:
---

We currently use the card-popup (with the markdown editor) to show the file-diffs. This works ok.

there is 1 annoying thing: for code diffs, it is better to have a more wider popup, but for regular card-popups, this is too wide, so the user is constantly changing size.

better solution would be to have a different configuration setting for card-popups that are showing a diff. So when the diff is opened, the card automatically switches to the last diff-size. Any changes in the size of the card are then saved to the last-diff size instead of the cards. when the diff closes, card goes back to card-size