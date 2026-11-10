---
author: 
id: F_467
internalId: d5f63dfb-c3f3-41f4-b300-0db72fc93f21
title: json data editor
status: design
owner: 
affects:
agents:
policy:
---
We need to add support for a json data editor, similar like we have the markdown editor.

* This should be a stand alone component
* when the user clicks on a link that is a json file, the editor should be opened
  * when in card-view, this should be a popup, similar like the card or action popups, so managed by the [card_popup_service.ts](app/src/services/card_popup_service.ts)
  * when in list view, this should be a new tab with a data editor
* for an array, show a table, the columns are the field names of the objects inside the array, if the array has primitives, there is only 1 column, 'values'&#x9;
  * user can add & delete, copy, cut, paste records.
  * user can select multiple records for copy, cut or delete
  * fields allow for inline editing
* for objects, show a form, with fields layout out vertically
* if a field value is a list or object, show a button to dig into the value. this is for objects and for lists.&#x20;
  * at the top of the data editor is a breadcrumb component that displays the path into the data.
    * user can click on items to go back