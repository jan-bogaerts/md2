---
author: 
id: F_161
internalId: 70f4d324-387f-4160-9465-51d9a8117b04
title: improve bottom buttons row on action popup
status: design
owner: 
affects:
agents:
policy:
---
we need to improve the way that the buttons are displayed on the action popup. These are the rules:

* when the agent is running instead of disabling the `send` and `schedule` buttons, hide them. only the `stop` button should be visible (at the location of the `send` button)
* &#x20;when the agent is `waitingForInput` :
  * instead of both the `finish` and `stop` button, only show the 'finish' button.&#x20;
  * the 'stop' button would prevent any 'next' actions to execute. If this button is no longer visible, we would loose this functionality, so instead:
    * if the 'finish' button is pressed while the `ctrl` key is pressed, then do the `stop` .  Put this in the tooltip of the button
    * a long press (for mobiles that have gesture / finger inputs) would do the same.
    * for both situations, first ask the user if he is certain and really wants to stop the sequence of actions or just indicate that this conversation is done and the rest of the action can continue.
  * if the input field is empty, the 'schedule' and 'send' buttons should be hidden. When text is entered, they become visible
* `schedule` button should only have an icon, no text.  Also, styling should be same as other buttons.
* every button should have a tooltip.