---
author: 
id: F_375
internalId: 4d894c57-e88c-49fc-8bb4-2533b8ee9ef6
title: Mindmap editing improvements
status: design
owner: 
affects:
agents:
policy:
after: d35077d6-dd5e-4bba-a00b-ad28b7e7df70
---
* When new diagram, in general, is created, switch app tab to diagram. It becomes available after switching to diagram view.
* On diagram menu:
  * Buttons are not grouped correctly, it should be;
    * Select, pan, add
    * Cut copy paste delete
    * Review, meta
* Legend should be editable inline, so&#x20;
  * \+ sign to right of ´legend´
  * Trashcan when mouse over on items
  * Edit label inline of item
  * Gear to modify style
* Add button needs improving:
  * It is part of the toggle group ´select´ and ´pan´. So 1 of the 3 is selected and remains selected. User can use same tool multiple times while selected. So while add is selected, user can continue adding objects of same type.
  * Label and icon are wrong. Drop label, icon should be that of selected tool.
* Touch is not correctly implemented. It is hard to drag objects with finger on mobiles
* Double click shows node details, that´s ok, but hrd to discover and limiting. Allow label to always be editable inline, show 3 dots icon when mouse over.
* Topics and roots dont have to be perfect round. Width can differ from height
* Curveture of connector should adjust according to relative position of nodes to each other: if ´from´ is below and to right of ´to´, curve is ok as is now. But if ´to´ would be below and to the right of ´from´, then curve should be opposite as is now.
* Diagram title and sub title should be inline editable ( for all diagrams)