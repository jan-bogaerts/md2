---
author: 
id: B_327
internalId: c406d6e4-8d5d-4036-8b27-264485b2fbe3
title: pasted images not saved
status: design
owner: 
affects:
agents:
  - design/activity/card__c406d6e4-8d5d-4036-8b27-264485b2fbe3.json
policy:
after: 2abaa832-8652-4464-aca4-963549cdbac2
---
The markdown editor accepts pasting images into the editor. While the editor remains open, this looks good. however, on cards, when you close and open the card again, the image itself is gone and it now says something like: `<img height="472" width="410" alt="pasted image" src="pasted-image-1c4cf12a-2a6c-4e32-b42b-134214d25ad3.png" />` So the image is not saved I suppose. we need to find a way to make this work. is it possible to 'inline' the image as a base64 string? or any other options?