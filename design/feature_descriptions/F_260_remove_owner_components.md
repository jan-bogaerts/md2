---
author: 
id: F_260
internalId: 2775052a-2e84-4466-a320-155c8ec05bac
title: remove owner components
status: new
owner: 
affects:
agents:
policy:
after: dec709de-25d5-4694-a29b-0506253a4094
---

we currently have a lot of components that wrap another component, have the same name as the componet they wrap with '\_owner' appended and just wrap those components in order to pass a prop into them.

This is the wrong architectural approach. we don't want to use this. The idea comes from an instruction that those components need to be self contained: a change in the property should not trigger a render in the parent. Meaning, these should never have been properties. Updates to these properties come from events and this should be handled within the component.

So we need to refactor and remove all those \_owner versions, put the value updates inside the components, remove the properties and replace the '\_owner' versions with the proper components.

ex: `app\src\components\actions\run\popup\action_usage_summary_owner.tsx` and `app\src\components\actions\run\popup\action_usage_summary.tsx`