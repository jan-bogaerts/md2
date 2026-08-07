---
author: 
id: B_91
internalId: c0571d27-a3f8-41bd-9a3b-861c7969f9af
title: cardsview columns did not update after auto change card state
status: new
owner: 
affects:
agents:
  - design/activity/card__c0571d27-a3f8-41bd-9a3b-861c7969f9af.json#conversation=agent-224acbad-0ba9-4967-9f6b-d3273674e8c7
policy:
after: a57b89e0-49f4-4c25-9d99-deea222460cd
---
an agent changed the state of a card to ready, but the UI did not get updated. the card remained in the old column, did not move to the 'ready' column.

This occured while using websockets