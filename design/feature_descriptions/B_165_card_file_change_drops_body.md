---
author: 
id: B_165
internalId: cd2dca75-15df-4f60-b640-8a8a91aba68e
title: card file change drops body
status: design
owner: 
affects:
agents:
  - design/activity/card__cd2dca75-15df-4f60-b640-8a8a91aba68e.json
policy:
---

I was editing a card that already had a body. we changed the title which caused the entire body to disappear. The data doesn't seem to be lost, the card simply drops the body: after closing the card and opening it again, the body is there again. This caveat: nothing in the body was changed, so when the body disappeared, the card was closed and opened again.

we recently did some major refactoring round the file watcher, when cards get reloaded and such. something went wrong, was skipped or brings it now to the surface.

lets investigate the algorithm and see where it is going wrong.