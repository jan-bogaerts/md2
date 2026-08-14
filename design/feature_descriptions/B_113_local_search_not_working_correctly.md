---
author: 
id: B_113
internalId: 332eb86e-d703-4707-a8de-0bdec67e23f5
title: local search not working correctly
status: new
owner: 
affects:
agents:
policy:
---

we recently implemented local search in cards, see [F\_104\_add\_local\_text\_search\_md\_editor.md](design/releases/0_3_0/F_104_add_local_text_search_md_editor.md)

this is still broken. what happens: user types letter in search box, search starts, highlights first word and puts focus on editor, so user can no longer finish typing the search text. this is bad behavior. search should only start when user presses enter or clicks the search button, not after first letter has been typed.