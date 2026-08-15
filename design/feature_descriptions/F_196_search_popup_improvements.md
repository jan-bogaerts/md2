---
author: 
id: F_196
internalId: f1c69bfd-cfb3-40cd-8c1e-15e78f71f839
title: search popup improvements
status: new
owner: 
affects:
agents:
policy:
---

following improvements to the search popup:

* it blocks the underlying app, it should not be a blocking app, the rest of the app should remain working while the popup is open
  this one is important, I believe it is the cause of another issue: after search term has been entered and user presses enter, first result is selected, but there is no way to go to the next search result unless the search box is closed.
* add arrows up and down to move to previous and next search result in the text.
* include total count of results in doc