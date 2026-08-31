---
author: 
id: B_189
internalId: c8c6f7ea-f3f2-4666-91f8-85b895a76302
title: cancel new card breaks input
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__c8c6f7ea-f3f2-4666-91f8-85b895a76302.json
policy:
after: 9823580d-2b15-4386-9be1-66a94937fb3a
---

We already looked at this before but it remains broken:

[B\_123\_cancel\_new\_card\_breaks\_input.md](design/releases/0_4_0/B_123_cancel_new_card_breaks_input.md)

this is super annoying. And apparently we don't need to fully cancel. so what happens:

* open add new card
* accidentally click outside of card which shows the prompt that asks to cancel the new card
* do not cancel the new card, so cancel the cancel
* finish card, save and close it
* open another card popup: no longer possible to focus an editor and start typing

## Current state

`NewCardDialog` handles backdrop, Escape, Cancel, and header-close dismissal through `closeDialog`. For a dirty draft, that function calls blocking native `window.confirm` while MUI `Dialog` remains open and owns a focus trap. A **focus trap** keeps keyboard focus inside the active modal and restores prior focus when that modal closes. Rejecting confirmation returns to the same new-card dialog; successful creation later closes it through `useProjectToolbarMenuActions.createCard`.

Existing-card details use non-modal `ResizablePopper` and shared `MarkdownEditor`. They cannot retain focus while a stale modal focus trap redirects focus back to the new-card dialog. No new-card state intentionally disables inputs, and shared Markdown editor code has no cancellation state. Native confirmation is the only blocking modal inside this dismissal path and bypasses React and MUI modal lifecycle.

Current tests isolate rejected confirmation, successful creation, and reopened input. They mock `window.confirm`, use synthetic value changes, or reopen another new-card dialog. They do not execute reported sequence with real focus: reject backdrop discard, finish and create draft, then open an existing-card popup and type in its title and Markdown body.

## implementation details

* Replace `window.confirm` in `NewCardDialog` with controlled MUI discard-confirmation dialog. Keep draft dialog mounted beneath it. Use MUI modal stacking and focus restoration; do not add delayed focus calls or disable focus enforcement.
* Make dismissal explicit: dirty dismissal opens confirmation; **Keep editing** closes only confirmation and restores focus inside unchanged new-card draft; **Discard** runs existing image cleanup, resets draft, then closes both dialogs.
* Keep cancellation single-flight while confirmation or image cleanup is active. Backdrop, Escape, Cancel, and header close must not open duplicate confirmations or run cleanup twice.
* If draft-image cleanup fails, report through `dialogService`, keep new-card dialog and draft open, and close discard confirmation so user can retry.
* Successful creation after **Keep editing** must clear confirmation state, reset draft through existing flow, and fully unmount new-card modal before later card-popup focus.
* Do not change shared `MarkdownEditor`, `ResizablePopper`, card creation, validation, attachments, or draft ownership unless full-sequence regression proves a remaining defect after native confirmation removal.
* Add interaction coverage for desktop backdrop dismissal and keyboard dismissal. Use real focus and keyboard input, not direct change events. Cover full reported sequence through existing-card title and Markdown editors. Add mobile coverage for available Cancel and Escape routes.

## acceptance criteria

* Backdrop click on dirty desktop new-card dialog opens one in-app `Discard this new card draft?` confirmation.
* Choosing **Keep editing** preserves title, Markdown body, type, target column, and draft images; title and Markdown body immediately accept focus and typing.
* After **Keep editing**, creating card closes new-card dialog once and leaves no mounted confirmation or new-card focus trap.
* Opening existing-card popup after that sequence allows user to focus and type in card title and Markdown body.
* Choosing **Discard** removes draft images once, clears draft, and closes new-card dialog once after cleanup completes.
* Cleanup failure reports error, preserves draft, and leaves new-card inputs usable.
* Backdrop, Escape, Cancel, and header close share one confirmation flow; repeated dismissal during confirmation or cleanup creates no duplicate prompt, cleanup, or close.
* Desktop and mobile regression tests pass for their available dismissal controls.
