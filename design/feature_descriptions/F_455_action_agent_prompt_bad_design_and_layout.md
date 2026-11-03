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
  * the layout is wrong: the questions box always takes up all the available space except for the fixed height of the 'Prompt' box. the way it should work: the prompt box should be minimum size as long as the questions box has not reached the min-content (max-height), the prompt box should fill the remainder of the space and it's content (so the responses bar and markdown editor should use all available space.
* after any edit, for instance in a card, when we switch away from the application while an action popup was open, it will do a full reload 3 times (so with each reload, it will do all the rerenders as described above). This is very strange behavior, nothing changed on the action, yet is still reloads multiple times.
* same thing after closing or opening a card: totally unrelated action popups reload. this is not correct behavior, as nothing about the action popups has changed, no data it relies on has changed.