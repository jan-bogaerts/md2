---
author: 
id: F_161
internalId: 70f4d324-387f-4160-9465-51d9a8117b04
title: improve bottom buttons row on action popup
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__70f4d324-387f-4160-9465-51d9a8117b04.json#conversation=agent-5eb541d4-c68d-4aad-b85d-5a15446b0bcc
policy:
---
we need to improve the way that the buttons are displayed on the action popup. These are the rules:

* when the agent is running instead of disabling the `send` and `schedule` buttons, hide them. only the `stop` button should be visible (at the location of the `send` button)
* &#x20;when the agent is `waitingForInput` :
  * instead of both the `finish` and `stop` button, only show the 'finish' button.&#x20;
  * the 'stop' button would prevent any 'next' actions to execute. If this button is no longer visible, we would loose this functionality, so instead:
    * if the 'finish' button is pressed while the `ctrl` key is pressed, then do the `stop` .  Put this in the tooltip of the button
    * a long press (for mobiles that have gesture / finger inputs) would do the same.
    * for both situations, first ask the user if he is certain and really wants to stop the sequence of actions or just indicate that this conversation is done and the rest of the action can continue.
  * if the input field is empty, the 'schedule' and 'send' buttons should be hidden. When text is entered, they become visible
* `schedule` button should only have an icon, no text.  Also, styling should be same as other buttons.
* every button should have a tooltip.

## Current state

`ActionPopupBottomRow` renders Stop, Finish, Schedule, Send, and Run controls. During an active agent session (`queued`, `running`, or `waitingForInput`), Schedule remains visible but disabled. Send remains visible for an active agent and is disabled until input can be sent. During `waitingForInput`, Stop and Finish can both be visible.

Schedule is an outlined text button with a calendar icon. Send, Stop, and Finish are icon buttons with tooltips; Schedule and command Run have no tooltips. `cancelPopupAction` stops the complete action run, including later `next` actions. `finishPopupAction` completes only the current agent conversation, allowing later actions to continue.

## Implementation details

- In `ActionPopupBottomRow`, derive button visibility from run status and trimmed prompt text. Treat `queued` and `running` as running states; handle `waitingForInput` separately.
- While agent is queued or running, render only Stop among trailing action buttons. Place Stop in Send's rightmost position. Do not render Schedule, Send, or Finish.
- While agent is waiting for input, hide Stop and render Finish. Hide Schedule and Send while trimmed input is empty; show both when trimmed input becomes non-empty.
- A normal Finish click calls `finishPopupAction`. Ctrl+click or a long press opens a confirmation with two explicit outcomes: `Stop sequence` calls `cancelPopupAction`; `Continue sequence` calls `finishPopupAction`. Long press means pointer remains pressed for 500 ms without release or cancellation. Prevent the click emitted after a completed long press from also finishing.
- Finish tooltip must explain normal Finish plus Ctrl+click and long-press Stop behavior.
- Replace Schedule text button with a calendar `IconButton`. Give it same size and interaction styling as other row icon buttons.
- Wrap every bottom-row control, including Schedule and command Run, in a tooltip. Keep an `aria-label` on each icon-only button.
- Keep existing backend availability, approval, question, interaction-readiness, validation, scheduling, cancellation, finish, and orphan persisted-conversation behavior unless a visibility rule above changes which control is rendered.
- Extend `action_popup_bottom_row.test.tsx` and relevant popup integration coverage for each visibility state, live prompt changes, Ctrl+click, long press, confirmation outcomes, click suppression after long press, tooltips, and existing live and orphan cancellation/finish paths.

## Acceptance criteria

- Given an agent is `queued` or `running`, only Stop is visible among Stop, Finish, Schedule, and Send, and Stop occupies the rightmost Send position.
- Given an agent is `waitingForInput` with empty or whitespace-only input, Finish is visible and Stop, Schedule, and Send are hidden.
- Given an agent is `waitingForInput` with non-whitespace input, Finish, Schedule, and Send are visible and Stop is hidden.
- Given waiting input changes between empty and non-empty, Schedule and Send hide or appear immediately without rerendering unrelated popup content.
- Given user activates Finish normally, current conversation finishes and remaining `next` actions may continue.
- Given user Ctrl+clicks Finish or holds it for at least 500 ms, confirmation appears before any finish or stop operation runs.
- Given confirmation is open, `Stop sequence` stops complete action run; `Continue sequence` finishes current conversation and allows remaining actions to continue.
- Given long press opened confirmation, releasing pointer does not also invoke normal Finish. Pointer cancellation before 500 ms performs neither operation.
- Schedule displays calendar icon without text and matches size and styling of other icon buttons.
- Every bottom-row button has descriptive tooltip; every icon-only button has matching accessible name.
- Existing command Run behavior and existing backend, approval, question, validation, live-run, and persisted orphan-conversation safeguards remain intact.
