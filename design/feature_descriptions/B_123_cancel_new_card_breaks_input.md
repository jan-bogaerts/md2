---
author: 
id: B_123
internalId: 8c67b588-6f04-46d4-973a-2104345f161e
title: cancel new card breaks input
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__8c67b588-6f04-46d4-973a-2104345f161e.json
policy:
---

something seriously wrong with canceling a new card:

* we get the same 'are you certain' question 2 times
* after canceling, it it no longer possible to input text anywhere. it is not possible to put keyboard focus on an input element

## Current state

`NewCardDialog` routes Cancel buttons, header close, backdrop dismissal, and MUI `Dialog.onClose` through asynchronous `closeDialog`. Clicking Cancel starts that flow once. Escape also reaches a form handler because the form prevents the default browser action but does not stop event propagation; MUI handles the same key through `Dialog.onClose`. Escape therefore starts `closeDialog` twice and explains the duplicate confirmation for that route.

All routes keep the dialog mounted while native `window.confirm` and draft-asset cleanup run. No in-progress guard prevents another dismissal from entering `closeDialog` during that wait. MUI `Dialog` also owns a focus trap: logic that keeps keyboard focus inside the active modal and restores focus when it closes. Source inspection proves the duplicate Escape path, but does not prove that duplication causes the reported focus loss or exclude a single Cancel-button click from the bug.

Existing attachment coverage clicks Cancel, reopens the dialog, then changes input values through synthetic events. Those changes do not require browser keyboard focus, so the test cannot detect the reported lock. A temporary JSDOM focus check could focus both reopened fields after button cancellation; the browser or Electron failure remains unverified and needs interaction-level reproduction.

## implementation details

* Reproduce confirmed cancellation separately through Cancel-button click and Escape. Record confirmation count, close-callback count, focused element after closure, and focus behavior after reopening. Do not treat Escape duplication as the sole focus-loss cause without this evidence.
* Remove the form-level Escape handler. Let MUI `Dialog.onClose` be the single Escape and backdrop cancellation path; Cancel and close buttons continue to start the same cancellation operation directly.
* Make cancellation single-flight across every dismissal route. **Single-flight** means one cancellation operation may run at a time; later dismissal attempts reuse or ignore that operation instead of opening another confirmation, deleting assets again, or closing twice.
* Keep current cancellation order: check dirty draft, ask once, wait for draft-asset deletion, reset form, then call the parent close callback. If deletion fails, report through `dialogService` and keep dialog open with its draft intact.
* Do not change creation, attachment, template, validation, or non-dirty cancellation behavior.
* Add regression coverage for dirty Cancel-button and Escape cancellation with confirmation accepted and rejected. Assert one confirmation and at most one cleanup and close callback per user action.
* Add interaction-level reopen coverage after confirmed cancellation. Use real focus and keyboard input, not direct value-change events. Verify title and Markdown body receive focus and accept typing; test both fields because reported failure affects all inputs, not only MDXEditor.
* If click cancellation still loses focus after cancellation is single-flight, fix ownership or cleanup of the remaining modal focus trap. Do not mask the failure with delayed focus calls.

## acceptance criteria

* Pressing Escape on a dirty new-card dialog shows exactly one `Discard this new card draft?` confirmation.
* Clicking Cancel on a dirty new-card dialog shows exactly one confirmation.
* Rejecting either confirmation keeps dialog open, preserves title and body, and leaves both inputs usable.
* Accepting either confirmation discards draft assets once, clears draft state, and closes dialog once after cleanup finishes.
* Cancel button, header close button, backdrop click, and Escape each use one cancellation flow.
* Reopening after confirmed button or Escape cancellation gives usable keyboard focus: user can type in title and Markdown body and move focus between them.
* Draft-asset cleanup failure still reports an error, preserves draft, and keeps dialog open.
* Focus and cancellation regression tests pass on desktop and mobile dialog presentations.
