---
author: 
id: B_353
internalId: 0f515f9c-2043-46a5-87e1-547488b1a772
title: edited regular markdown file in list view which got replaced
status: design
owner: 
affects:
agents:
policy:
---

I think there is a serious bug in the system regarding the editing and saving of regular markdown files.

I opened the markdown file through the link on a conversation on an action popup. then changed some things to the file. I think i clicked on it again from within the action popup, closed it, opened some other markdown files, including the card that triggered the generation of the markdown file I edited.

In the ui everything looked ok, but the agent reported it could no longer find the file.

I closed and reopened the project and now the file was gone, but we had 2 duplicates of the card file. so something went seriously wrong her. perhaps in the save or commit process of the markdown editor in listview