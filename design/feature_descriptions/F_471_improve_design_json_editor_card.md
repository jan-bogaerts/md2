---
author: 
id: F_471
internalId: ae5e8eda-0616-4f77-9fc9-c756450dcd7e
title: improve design json editor card
status: ready for implementation
owner: 
affects:
agents:
policy:
after: da4aee5d-5816-4fa9-ae35-cdd114954868
---
see the current json editor (for lists):

<img height="329" width="436" alt="pasted image" src="pasted-image-4e056b05-a9dd-4bb2-bb13-094ca7510720.png" />

and for the objects:

<img height="338" width="448" alt="pasted image" src="pasted-image-63b5e4b1-ce8b-4be3-8218-cf5b7e66dafc.png" />

compared to the design of the cards:

![pasted image](pasted-image-ad7ac880-bdd1-4553-8478-29976ba36fc3.png)

which is much better.

so we need to improve the design. some things I can already come up with:

* title
* the border of the popup, I think the card has a shadow, lets use the same for the json editor
* lets drop the card but use the footer bar and show the list actions there
* use icons for the list actions (like `add` and such)