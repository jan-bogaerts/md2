---
author: 
id: B_19
internalId: ebb4485a-af05-4634-a21c-5bf5c38c5deb
title: import of transcribe index nok
status: design
owner: 
affects:
agents:
  - design/activity/card__ebb4485a-af05-4634-a21c-5bf5c38c5deb.json
policy:
---

We did an import of a previously exported data-set which contained all indexes, including the new 'ocr' index which is of purpose 'transcribe'. So the observations have observation-character records, which allows an observation to reference multiple categories.
It also means that the observation itself has no reference to a category.

Now, the problem is that the import recalculates the values for picCount and VidCount on the categories using a db query after the import. this is to get the exact values and not the calculated values.

and this is where it fails for the ocr model: the import doesn't know yet about 'transcribe' types and that they need to be handled a little different:

* if the observation has a text-value, it needs to be split up in chars and the appropriate observation-characters records need to be created.
  Note: this must be done efficiently, so try to use batches as much as possible, as is already done for other tables. this improves speed a lot.
* the category counts need to be done on the observation-characters table.