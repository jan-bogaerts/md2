---
author: 
id: B_79
internalId: e5cd5482-cb72-4890-b111-cd1030847cc8
title: editor alignment in list view
status: new
owner: 
affects:
agents:
policy:
after: b692b422-3e30-4518-91c1-bcee5451b046
---

When in listview, The width of the tab-content container appears to be determined by the width of the tab bar. The result is that if there are many tabs open, the text in the markdown editor is too wide, but there are no scollbars, so part of text is not visible.

solution: width of container should be determined by available space, the tabbar should show scrollers when not all tabs are visible.