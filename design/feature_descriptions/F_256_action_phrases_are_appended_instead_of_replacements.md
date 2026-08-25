---
author: 
id: F_256
internalId: cd9535f0-5c2f-4544-a485-c37091c9b3f0
title: action phrases are appended instead of replacements
status: design
owner: 
affects:
agents:
policy:
---

when a user clicks on a predefined phrase to use in a prompt for an action, the input prompt is completely replaced with the phrase. this way, the user can not first type something.

better is to append the phrase, from the current cursor position. if there is no cursor position, a full replace is still allowed