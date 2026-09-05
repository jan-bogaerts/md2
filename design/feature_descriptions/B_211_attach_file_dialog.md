---
author: 
id: B_211
internalId: 18303c22-4ed4-4063-b55e-3f9bee7d4d4d
title: attach file dialog
status: new
owner: 
affects:
agents:
policy:
after: df7f7a94-ee33-44a3-b499-2b230d484fef
---
when attaching a file to a card, we ask the user to copy the file in the project or link to from where it is currently. if the card popup is open, then this dialog is not visible cause the z-index of the card popups. so we need to set the z-index of the dialog I think. I think&#x20;