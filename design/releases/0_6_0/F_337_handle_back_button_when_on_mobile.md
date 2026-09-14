---
author: 
id: F_337
internalId: 78a34547-ca4b-47ac-97cf-78b33da210e9
title: Handle back button when on mobile
status: ready
owner: 
affects:
agents:
  - design/releases/0_6_0/card__78a34547-ca4b-47ac-97cf-78b33da210e9.json
policy:
changedFiles:
  - app/src/components/hooks/use_card_popup_back_dismiss.test.tsx
  - app/src/components/hooks/use_card_popup_back_dismiss.ts
  - app/src/components/shell/project/new_card_dialog_back_dismiss.grouped.test.tsx
  - app/src/services/mobile_back_dismiss_service.node.test.ts
  - app/src/services/mobile_back_dismiss_service.ts
after: cd3e256b-4d1e-433f-97b9-a662110f1596
---

When the app is on a small screen and running in a browser, so not in electron. And a popup is open, which will be full screen in this situation, then the browser´s back button should close the popup.

## Current state

* Small screen means the MUI media query `theme.breakpoints.down('md')`, which every mobile-aware component in the app already uses, for example `card_action_popup_host.tsx` line 13 and `new_card_dialog.tsx` line 65.
* Running in a browser rather than in Electron is detected with `isElectron()` in `app/src/services/electron_lifecycle_bridge.ts`, which returns the preload-injected `window.md2Lifecycle` bridge, or `null` when the page is served to a browser over the remote-control HTTP server.
* Card popups are owned by `CardPopupService` (`app/src/services/card_popup_service.ts`). It keeps one ordered array of entries, where the last entry is the top of the stack. Both popup kinds live in that array: action popups (`kind: 'action'`) and card-details popups (`kind: 'card-details'`). Entries are removed through `close(id)`, and `clear()` drops all of them when the open project or branch changes.
* On a small screen only the top entry is rendered: `card_action_popup_host.tsx` and `card_body_popover.tsx` both pass `visible={... && (!isMobile || entry.id === topEntryId)}`. Those visible popups are full screen, because `action_popup_frame.tsx` lines 92-102 and `card_body_popover.tsx` lines 274-289 force `100dvh`, `100vw`, zero margin and zero radius when `isMobile` is true.
* Today a card popup can only be dismissed with its close button or with `Escape`, handled by `ResizablePopper.handleKeyDown` (`app/src/components/resizable_popper.tsx` line 325). A phone browser has no visible `Escape` key, so the only obvious dismissal gesture on a phone is the browser back button, which currently leaves the app or moves through hash routes instead.
* The new-card dialog (`app/src/components/shell/project/new_card_dialog.tsx`) is also full screen on a small screen (`fullScreen={isMobile}`, line 213). Its open state is not held in a service: both `app_menu.tsx` and `project_toolbar_menu.tsx` hold a local `dialogMode` state and pass `open={dialogMode === 'card'}`. Its dismissal path is `handleDialogClose`, which shows a discard confirmation first when the draft is dirty, so a dismissal request does not always close the dialog.
* Routing uses the URL hash only. `navigateTo` in `app/src/app/app_navigation.ts` writes `window.location.hash`, and `useAppLocation` listens to both `hashchange` and `popstate` to recompute the route. The app never calls `history.pushState` anywhere, so no existing code owns history entries, and back currently walks the hash routes or leaves the app.

## implementation details

* Add one renderer-side owner of back-button dismissal, `app/src/services/mobile_back_dismiss_service.ts`, exporting `mobileBackDismissService`. It keeps an ordered array of registrations, each holding an id and an `onDismiss` callback, and it owns the single `popstate` listener used for dismissal. Nothing else in the app calls `history.pushState`.
* A registration is only created when the caller says its surface is currently full screen on a small screen and the app runs in a browser, so the caller computes `active` as `isMobile && !isElectron()`. Registering is what pushes history, so on Electron or on a wide screen nothing is registered and history stays untouched.
* Registering pushes one history entry with `history.pushState({ md2BackDismiss: <id> }, '')` and no URL argument, so the URL, including the hash, does not change. That keeps the history depth equal to the number of registrations, and it keeps `useAppLocation` on the same route because `readLocation` reads the unchanged hash.
* On `popstate`, when the registration array is not empty, the service calls the top registration's `onDismiss` and then synchronously pushes a replacement entry, so the depth still matches the registration count. It deliberately does not drop the registration there: a dismissal is a *request*, and a surface such as the new-card dialog may legitimately stay open (see the discard confirmation below). A registration disappears only when its owner unregisters.
* Unregistering, which happens once the surface actually closed, removes the record and schedules one unwind step. Unwind steps accumulate in a counter that is flushed once in a microtask as `history.go(-count)`, so closing several popups at once, as `CardPopupService.clear()` does on a project or branch switch, collapses into a single history move instead of a queue of `history.back()` calls. The service marks those moves as self-inflicted with a pending-unwind counter; the `popstate` handler decrements that counter and returns without dismissing anything, so the app's own history cleanup never closes a second popup.
* When the registration array is empty the `popstate` handler does nothing, so a back press with no full-screen surface open keeps its current behaviour: `useAppLocation` handles the hash route, or the browser leaves the app.
* Card popups register from one place rather than per component. Add a hook `useCardPopupBackDismiss()`, mounted once where the popup hosts live, which subscribes to `CardPopupService` through `subscribeCardPopups` and keeps the number of registrations equal to the number of open entries, action and card-details alike. Its dismiss callback closes the top entry with `cardPopupService.close(entries.at(-1).id)`, which is exactly what the close button already does. One back press therefore closes one popup, and repeated presses walk down the stack, matching the existing rule that only the top entry is visible on a small screen.
* The new-card dialog registers itself from `new_card_dialog.tsx` while `open && isMobile && !isElectron()`, with `handleDialogClose` as the dismiss callback, so back behaves exactly like the dialog's own close button: a clean draft closes immediately, a dirty draft opens the discard confirmation and the dialog stays open. Because the service re-pushes after every dismissal request, the dialog still holds its history entry while that confirmation is up; pressing back again while the confirmation is showing hits the existing `dismissalPhaseRef` guard and does nothing, the same as pressing `Escape` there. The nested discard confirmation itself is not back-dismissable and stays out of scope.
* Both `app_menu.tsx` and `project_toolbar_menu.tsx` render a `NewCardDialog`, but only the mounted host's dialog is ever `open`, and registration is conditioned on `open`, so no duplicate history entry can be created.
* Renderer-only change. No Electron main-process code, no preload bridge, no WebSocket message, no persistence, no Git operation, and no card or project state change.
* Tests: node tests for `mobile_back_dismiss_service` covering the push on register, dismissal of the top registration on `popstate` with its replacement push, the ignored `popstate` when nothing is registered, batched unwinding of several unregistrations into one `history.go`, and no dismissal firing for a self-inflicted unwind. Component tests for the card-popup hook covering that two stacked popups need two back presses, and that a desktop-width or Electron run registers nothing. A grouped test for `new_card_dialog.tsx` covering back with a clean draft closing the dialog, and back with a dirty draft showing the discard confirmation while the dialog stays open.

## acceptance criteria

* In a browser on a small screen, with a full-screen card action popup open, pressing the browser back button closes that popup, keeps the user on the board, and does not leave the app or change the URL hash.
* The same holds for a full-screen card-details popup and for the full-screen new-card dialog.
* With two card popups stacked, the first back press closes the top one and reveals the one below it, and a second back press closes that one. Each press closes exactly one popup.
* Back on the new-card dialog with a dirty draft shows the same discard confirmation as the dialog's close button, and the dialog stays open when the user chooses to keep editing; a following back press does not close it while that confirmation is showing.
* Back with no full-screen surface open behaves as it does today: the hash route handled by `useAppLocation` changes, or the browser leaves the app.
* Closing a popup with its close button or with `Escape` leaves no leftover history entry, so a single back press right afterwards performs a normal navigation instead of doing nothing.
* Switching project or branch, which clears all popups at once, consumes all of their history entries in one move, so back afterwards performs a normal navigation.
* On the desktop Electron app, and in a browser on a wide screen, no history entries are pushed and back behaviour is unchanged.
