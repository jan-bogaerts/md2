---
author: 
id: F_474
internalId: c8fdbf7f-e685-4590-8532-4103d2d68287
title: custom size for cards showing code diff
status: ready
owner: 
affects:
agents:
  - design/activity/card__c8fdbf7f-e685-4590-8532-4103d2d68287.json
policy:
after: 41d340e6-afae-44bd-82e7-41ab673c94e0
changedFiles:
  - app/src/components/card_view/card_body_popover.tsx
  - app/src/components/card_view/card_body_popover_commit.test.tsx
  - app/src/components/resizable_popper.test.tsx
  - app/src/components/resizable_popper.tsx
  - app/src/services/storage/application_storage.service.test.ts
  - app/src/services/storage/application_storage.ts
---

We currently use the card-popup (with the markdown editor) to show the file-diffs. This works ok.

there is 1 annoying thing: for code diffs, it is better to have a more wider popup, but for regular card-popups, this is too wide, so the user is constantly changing size.

better solution would be to have a different configuration setting for card-popups that are showing a diff. So when the diff is opened, the card automatically switches to the last diff-size. Any changes in the size of the card are then saved to the last-diff size instead of the cards. when the diff closes, card goes back to card-size

## Current state

`CardBodyPopover` renders normal card editing and commit/worktree diff mode inside the same `ResizablePopper`. Desktop popups use one application-wide `md2.cardBodyPopover.size` value for both modes. `ResizablePopper` reads its `storageKey` only when mounted, then persists every size change to that key. Entering or leaving diff mode changes only `CardDetailsPopupEntry.diffSelection`, so popup size and storage destination never change.

Diff mode now contains the tabbed `CardCommitDiffPanel` workspace from F_473. Any selected commit or worktree diff uses that mode, including its Files tab, card Markdown diff, and code-file tabs. Mobile card popups remain full-screen, non-resizable, and do not read or write desktop popup sizes.

## Implementation details

- Keep `md2.cardBodyPopover.size` as the shared normal-card profile. Add a separate application-storage key for the shared desktop diff profile and select it whenever `CardBodyPopover` has a commit or worktree `diffSelection`.
- Make `ResizablePopper` switch size profiles when its `storageKey` changes without remounting the popup or its editor/workspace children. Before switching, save current size under outgoing key. Then load incoming key and apply viewport/minimum clamping. If incoming diff key has no valid saved size, use active normal popup size; this defines first diff size. When diff closes, load saved normal size.
- Treat profile change as one transition: outgoing size must never be written under incoming key. Abort any active resize before switching, and ensure later resize events persist only to active profile. Keep dragged position when possible; clamp it when loaded size would place popup outside viewport.
- Switching between commit and worktree diffs, or between tabs inside one diff, keeps diff profile active. First `Escape` clears diff selection and restores normal profile; second `Escape` keeps existing popup-close behavior. Fullscreen styling remains a visual override and must not overwrite either stored profile.
- Keep size ownership in `ResizablePopper`; `CardPopupService` continues to own only popup entries and diff selection. No new card or conversation identity is introduced.
- Shared-helper impact: `CardBodyPopover` is only caller that supplies a changing desktop size key. Action popup, sequence popup, Markdown file selector, JSON data popup, and global search keep fixed or absent keys and retain current sizing and persistence behavior.
- Add new storage key to application-storage migration keys so an existing browser-local value can move into desktop application state during normal legacy migration.
- Add focused `ResizablePopper` tests for profile save/load, missing and invalid incoming values, viewport clamping, dragged-position clamping, and prevention of cross-profile writes. Add card-popup tests for first diff inheritance, independent diff resize persistence, normal-size restoration, later diff reuse, unchanged diff profile across diff-source/tab changes, fullscreen behavior, Escape order, and no mobile persistence. Run affected tests and app lint only.

## Acceptance criteria

- Opening any commit or worktree diff in a desktop card popup switches to last saved diff size without remounting popup content.
- First diff with no valid saved diff size starts at active normal popup size.
- Resizing while diff is open updates only diff-size setting. Resizing normal card popup updates only normal-card setting.
- Closing diff restores last normal-card size. Opening another diff restores last diff size.
- Changing selected commit, switching between commit and worktree sources, or changing diff workspace tabs does not switch back to normal size.
- Invalid or oversized saved values fall back or clamp safely, and switching profiles cannot move a dragged popup outside viewport.
- First `Escape` exits diff and restores normal size; second `Escape` closes popup.
- Mobile full-screen card popup behavior and all non-card `ResizablePopper` callers remain unchanged.
- Focused tests and app lint pass.
