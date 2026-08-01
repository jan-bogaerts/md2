---
author:
id: J-025
internalId: 96705093-a302-409d-b626-fe3e16fd28e2
title: move action popup state and subscriptions to leaf owners
status: ready
owner:
affects:
  - app/src/components/actions/action_popup.tsx
  - app/src/components/actions/action_popup_content.tsx
  - app/src/components/actions/use_action_popup_controller.ts
  - app/src/components/actions/action_selector.tsx
  - app/src/components/actions/action_conversation_chat.tsx
  - app/src/components/actions/action_log_error_display.tsx
  - app/src/components/actions/action_agent_approval.tsx
  - app/src/components/actions/action_agent_question.tsx
  - app/src/components/actions/action_popup_bottom_row.tsx
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Make popup roots own layout and selection only. Move changing application data, subscriptions, and operations to the smallest component that renders or acts on them.

## Required change

- Remove `useActionPopupController`; do not replace it with another aggregate controller.
- Remove active-run subscriptions from `ActionPopup` and `ActionPopupContent`.
- Keep popup initialization as a one-time action/context binding lookup without subscribing the root.
- Give `ActionSelector` a context-scoped status subscription.
- Give the conversation section a subscription to only its bound run's canonical conversation.
- Give status/log, approval, question, and run-control leaves their required run-store subscriptions.
- Use the stable prompt store from J-022 only in the editor and prompt-dependent controls.
- Put conversation-history loading and selection in the conversation owner, not the popup root.
- Move schedule state and run-history loading to their existing leaf sections.
- Event handlers read current service/store state when invoked; changing state is not routed through root props.
- Do not use memoization as the ownership fix. Memoization may be added only after subscription boundaries are correct.

## Render contract

- Conversation entry updates render only the conversation leaf.
- Run status changes render only leaves that display or depend on status.
- Logs, approvals, and questions render only their owners.
- Status changes for another action or card render nothing in this popup.
- Prompt typing and flush render no popup root or unrelated section.
- Markdown-style changes update Markdown consumers through J-021 without rebuilding styles locally.

## Testing implications

- Add render-count regression tests around `ActionPopup` and `ActionPopupContent`.
- Prove another card/action run cannot render this popup.
- Prove conversation streaming renders only the conversation boundary.
- Prove selector status changes render only the selector boundary.
- Prove prompt typing and flush render only subscribed prompt controls.
- Preserve popup open/close, action selection, scheduling, history, continuation, approval, question, cancel, finish, and resize behavior.

## Acceptance criteria

- [ ] `useActionPopupController` is deleted.
- [ ] Popup roots contain no action-run, conversation, prompt, log, approval, question, or history subscription.
- [ ] Each changing value is subscribed to by the smallest rendering owner.
- [ ] Unrelated run changes cause zero renders in the popup.
- [ ] Relevant changes do not render unrelated popup sections.
- [ ] Existing popup behavior remains unchanged.
- [ ] App lint and tests pass.

## Dependencies

J-021, J-022, J-023, and J-024 must be implemented first.
