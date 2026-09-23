---
author: 
id: F_144
internalId: 385eccb9-06c4-4d93-8f8a-5f9b9f42e45f
title: appbar and toolbar scrolling
status: design
owner: 
affects:
agents:
policy:
---
When on the desktop (on mobile, it is ok):

currently, when the markdown editor toolbar doesn't fit in the window (horizontally), it shows a standard horizontal scrollbar and also a vertical scrollbar cause the hor scrollbar takes up too much space.

This is not ok, we need to add custom scroll behavior for this and also the appbar.

options I can think of:

* use different scroll solution:
  * when hor scrolling is needed, use 2 buttons: one at the left side, one at the right, visible when scrolling in that direction is possible. when clicked, scroll toolbar.
  * scrolling with the mouse wheel should also scroll horizontally
  * don't show standard scrollbars
* resize the container that contains the appbar / markdown toolbar so that we don't need a vertical scrolbar
* and optionally also use a smaller scrollbar like on mobile

what option do you think is best?