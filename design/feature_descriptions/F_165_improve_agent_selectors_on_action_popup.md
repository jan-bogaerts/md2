---
author: 
id: F_165
internalId: c38e7423-9b05-47e2-a728-9637a25f9a2e
title: Improve agent selectors on action popup
status: new
owner: 
affects:
agents:
  - design/activity/card__c38e7423-9b05-47e2-a728-9637a25f9a2e.json#conversation=agent-6127a6ec-3c7b-4396-8c07-e7063d6fd63a
policy:
---
We need to improve and refactor the agent selector component.

First, ´app/src/components/actions/agent/action\_agent\_selectors\_owner.tsx´ is a useless wrapper. This should be handled by the selector itself, the concept of owner is wrong. The component does this itself.

Second, we need to move it from top to bottom. On the bottom row where token-usage and buttons are. Tehe selector is to the left (fist in box), token-line-change centered, buttons to the right.

Finally, display needs to be changed. The agent selector should be 2 buttons:&#x20;

* Model selector button. Displays the model and level. User can infer agent based on model. Ex ´gpt-5.6-sol medium´.   When clicked, open context menu with 3 sections:
* &#x20; Agent: claude, codex
* &#x20; Model: changes depending on value of agent
* &#x20; Thinking level
* Security button. Icon and color show selection: green, yellow red. On click, context menu opens.