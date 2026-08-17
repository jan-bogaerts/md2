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

`NewCardDialog` puts an Escape handler on its form while MUI `Dialog` already handles Escape through `onClose`. One Escape key event reaches both handlers because the form prevents the default browser action but does not stop event propagation. Both handlers start `closeDialog`, so a dirty draft opens `window.confirm` twice. After confirmation, both asynchronous calls discard draft assets, reset the shared Markdown draft and local fields, and call the parent close callback.

MUI `Dialog` also owns a focus trap: logic that keeps keyboard focus inside the active modal and restores focus when it closes. Running the same modal close lifecycle twice can leave focus handling inconsistent when the dialog closes or reopens. Existing tests decline the Escape confirmation and assert only its message, so they do not detect the second call, confirmed cancellation, duplicate close callback, or later input focus.

## implementation details

* Remove the form-level Escape handler. Let MUI `Dialog.onClose` be the single Escape and backdrop cancellation path; Cancel and close buttons continue to call that same path directly.
* Keep current cancellation order: check dirty draft, ask once, wait for draft-asset deletion, reset form, then call the parent close callback. If deletion fails, report through `dialogService` and keep dialog open with its draft intact.
* Do not change creation, attachment, template, validation, or non-dirty cancellation behavior.
* Add regression coverage for dirty Escape cancellation with confirmation accepted and rejected. Assert one confirmation and at most one close callback per user action.
* Add reopen coverage after confirmed cancellation. Verify title and Markdown body receive focus and accept keyboard input; test both fields because reported failure affects all inputs, not only MDXEditor.

## acceptance criteria

* Pressing Escape on a dirty new-card dialog shows exactly one `Discard this new card draft?` confirmation.
* Rejecting confirmation keeps dialog open, preserves title and body, and leaves both inputs usable.
* Accepting confirmation discards draft assets once, clears draft state, and closes dialog once after cleanup finishes.
* Cancel button, header close button, backdrop click, and Escape each use one cancellation flow.
* Reopening after confirmed cancellation gives usable keyboard focus: user can type in title and Markdown body and move focus between them.
* Draft-asset cleanup failure still reports an error, preserves draft, and keeps dialog open.
* Focus and cancellation regression tests pass on desktop and mobile dialog presentations.
