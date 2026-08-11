---
author: 
id: B_109
internalId: c1af41da-7012-48b8-a985-64cc138f8baa
title: Bad log activity reload
status: new
owner: 
affects:
agents:
policy:
---
App modifies activity log. Backend somehow gets confused, thinks an older version is newer and reverts to the older version.