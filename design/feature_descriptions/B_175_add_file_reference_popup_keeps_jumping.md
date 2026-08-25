---
author: 
id: B_175
internalId: 22fa2af9-9b97-47c2-931f-ed5a5a62f89d
title: add file reference popup keeps jumping
status: new
owner: 
affects:
agents:
policy:
after: d0c8354f-cfea-4ad6-b863-9bd2dbb54b52
---

When the user enters the 'at' character, we show a popup where the user can select a file reference to insert in the markdown text. this works, however, the popup behaves badly when the user keeps typing in order to refine the search in the popup: it keeps moving / repositioning itself and resizing. neither should happen. the anchor position should remain at where it was first opened when the 'at' char was typed and keep the popup the same size. in fact, it should use the already available resizable popup. the search results popup, card and action popups already use it.