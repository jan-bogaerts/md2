---
author: 
id: F_455
internalId: b498d656-e91c-45ad-8fdc-670525355e02
title: action agent prompt bad design and layout
status: design
owner: 
affects:
agents:
policy:
---
see [action_agent_prompt.tsx](app/src/components/actions/agent/action_agent_prompt.tsx):

* why is it receiving responsePrompts and bottomRow as properties? There must be a very good reason why you wrote the code like this since it is an explicit rule not to do this in the code base.
* when there are 'questions':
  * the component rerenders 8 times, why? can't we improve this
  * the layout is wrong:&#x20;