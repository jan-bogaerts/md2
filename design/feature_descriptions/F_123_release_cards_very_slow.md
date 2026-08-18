---
author: 
id: F_123
internalId: 3d893637-4714-428d-be90-b839925b7cad
title: release cards very slow
status: new
owner: 
affects:
agents:
policy:
after: 8624544e-9fd6-4a27-837c-95e504a2c5d6
---
Release is done, but dialog remains open, released cards aren't removed from the board.

It appears to mostly take a long time.

Things noticed during release:

* every card is moved individually, with every card the full ui is updated. this should not be the case. we should batch the process and update the ui when done.
* after every released, a commit appears to be done? should not be the case
* total token count for the project kept going up and down as cards were moved to the release folder. this makes no sense what so ever. the release process should have no impact on total project token count. This suggest that the total token count might not be correct