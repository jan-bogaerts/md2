---
author: 
id: F_429
internalId: b2cc61d8-9d79-41d0-b8bb-082a01cb0db4
title: no commit batch after conversation view changed
status: design
owner: 
affects:
agents:
  - design/activity/card__b2cc61d8-9d79-41d0-b8bb-082a01cb0db4.json
policy:
---

When conversation view changes from 'true' to 'false', it does not seem that the activity log is scheduled for being committed. This should be fixed.