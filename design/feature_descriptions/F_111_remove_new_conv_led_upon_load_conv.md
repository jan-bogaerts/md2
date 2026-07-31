---
author: 
id: F_111
internalId: 6fdba724-f0ab-484a-9831-0480bc6d5e8d
title: remove new conv-led upon load conv
status: design
owner: 
affects:
agents:
policy:
after: e69b9faf-30dd-4ad6-9d99-7e6af4d18c76
---
When an agent is finished, we show a small blue led on the 'action' button in the `action-popup`. This is ok. However, it remains there for as long as the action popup remains open. Also, the user initially gets to see an empty chat window, which is confusing. So:

* when an action completes while the chatlog of that action is active (so action-popup open and action button selected), then we should mark the log as `viewed`
* when the user clicks on an action button that has a log still marked as `ready but not yet viewed`, then instead of showing an empty log history, immediately open the last log (that is marked as ready, not yet viewed).
* as soon as the log is shown, remove the led from the action button. the log has been viewed, so lets show it this way.

## Current state

`agentAcknowledgementService` stores one completed-result checkpoint per card. `CardRunButton` derives unseen action IDs when opening a popup, and `CardActionPopupService` keeps that copied list for popup lifetime. `ActionConversationChat` acknowledges a completed conversation once rendered, but copied selector state does not update, so blue LED remains.

`useActionPopupController` automatically restores latest waiting conversation only. Selecting action with unseen completed result therefore starts with empty chat until user selects history manually.

## implementation details

- Derive latest unseen completed conversation per action from current card conversations and acknowledgement checkpoint. Keep popup data reactive while open; remove frozen unseen-ID snapshot. Preserve existing local-storage format and card-level checkpoint semantics.
- When user selects action with unseen results, load newest unseen conversation. Keep normal empty-conversation state for actions without unseen results and for explicit `Conversations` reset.
- Acknowledge only after completed conversation is displayed. This covers action completing while selected and removes both action LED and card unseen indicator immediately.
- Keep result unseen if conversation load fails and report existing load error.
- Add acknowledgement-query, popup-selection, active-completion, multiple-result, and load-failure regression tests.

## acceptance criteria

- Clicking action with unseen results immediately shows newest unseen conversation; empty chat is not shown first.
- Showing conversation clears action LED and card unseen-result indicator without closing popup.
- Action completing while its chat is selected is marked viewed and leaves no LED.
- Action completing while another action is selected remains marked unseen until opened.
- Multiple unseen results open newest result; existing checkpoint marks it and older results viewed.
- Failed load leaves result unseen and shows error.
