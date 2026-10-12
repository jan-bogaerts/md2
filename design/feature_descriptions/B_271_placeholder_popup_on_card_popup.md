---
author: 
id: B_271
internalId: 55646f70-22ca-4ed7-a4b6-d2e0276d1923
title: placeholder popup on card popup
status: design
owner: 
affects:
agents:
  - design/activity/card__55646f70-22ca-4ed7-a4b6-d2e0276d1923.json
policy:
---
check [F\_420\_missing\_placeholder\_popup.md](design/releases/0.8.3/F_420_missing_placeholder_popup.md). we added the placeholder popup again to the card popup, but implementation is not correct. see how the positioning is done when used on the [action\_popup.tsx](app/src/components/actions/run/popup/action_popup.tsx).&#x20;

maybe relative vs absolute pos coordinates?