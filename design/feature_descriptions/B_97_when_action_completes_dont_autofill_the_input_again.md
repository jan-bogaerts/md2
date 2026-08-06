---
author: 
id: B_97
internalId: 963bef1f-5a53-4f16-8941-13f9be36b88a
title: when action completes dont autofill the input again
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__963bef1f-5a53-4f16-8941-13f9be36b88a.json#conversation=agent-7a0ca6e7-31d6-48d9-8547-7a17677375e0
  - design/activity/card__963bef1f-5a53-4f16-8941-13f9be36b88a.json#conversation=agent-2381b098-316e-4282-b15c-a6e4982600e7
policy:
after: 
---

In the action-popup, when an action switches to 'completed' the input box is auto-filled again with a new input which should not happen.

# Current state

`ActionAgentPromptOwner` prepares the stored action prompt whenever no session is active. A completed run is no longer active, so completion clears the run draft and immediately triggers preparation again, filling the editor with a new prompt.

# Implementation details

- Do not prepare a stored prompt while the selected action's run status is `completed`.
- Keep the cleared prompt draft empty after completion.
- Preserve stored-prompt preparation for an idle action opened for a new run. Keep failed and cancelled retry behavior unchanged.

# Acceptance criteria

- Completing an action while its popup is open leaves the input empty.
- Completion does not request or apply another prepared prompt.
- Opening an idle action for a new run still prepares its stored prompt.
- Popup tests cover the completion transition and idle prefill behavior.
