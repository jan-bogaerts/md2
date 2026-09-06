---
author: 
id: B_224
internalId: fa429997-fee2-4e1d-a21f-3ea586ab12ae
title: size of question box and input box
status: design
owner: 
affects:
agents:
policy:
---

the way that the size of the question box and the input box is managed currently on the action popup, is a bit broken. Currently, as soon as you touch the resize bar (above the input box), the question box goes to minimum size and wont recover anymore. this is a problem.

it should work like this:

* when user enters text in input box, this becomes primary so question box goes to minimum size, the rest is for the input box.
* when user clicks on any location on the question box (so it gets focus), this becomes primary and the input box should go to minimum size while the question box uses the remainder of the space.