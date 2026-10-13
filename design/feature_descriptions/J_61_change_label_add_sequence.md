---
author: 
id: J_61
internalId: 6c251422-b0dc-4d72-a279-ca60271a41bb
title: change label add sequence
status: ready
owner: 
affects:
agents:
  - design/activity/card__6c251422-b0dc-4d72-a279-ca60271a41bb.json
policy:
changedFiles:
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/shell/menu/app_menu.tsx
  - app/src/components/shell/menu/mobile_create_menu.test.tsx
  - app/src/components/shell/menu/mobile_create_menu.tsx
  - docs/actions/running-actions.md
  - docs/tutorials/sequencing-and-scheduling.md
---

on the app bar we have a button to add a sequence. currently says 'add sequence'. the rest says 'new' so we should change to 'new sequence'

## Current state

Sibling create controls use `New …` (`New card`, `New action`, `New diagram`). The sequence entry point still says `Add sequence` in:

* `app/src/components/shell/menu/app_menu.tsx` — desktop Home tab button (opens sequence popup via `handleOpenCardSequence`).
* `app/src/components/shell/menu/mobile_create_menu.tsx` — `Create` menu item (via `handleCreateSequence`).
* `docs/actions/running-actions.md` (line 83) and `docs/tutorials/sequencing-and-scheduling.md` (line 71) — user docs reference `**Add sequence**`.

Tests asserting the old label:

* `app/src/components/shell/menu/app_menu.test.tsx` — `opens a sequence beside creation controls…` queries button `Add sequence`.
* `app/src/components/shell/menu/mobile_create_menu.test.tsx` — two menu-item order assertions end with `Add sequence`.

## Implementation details

Text-only change. No behavior, handler, disabled-state, or icon change.

* `app_menu.tsx`: button text `Add sequence` → `New sequence`.
* `mobile_create_menu.tsx`: menu item text `Add sequence` → `New sequence`.
* `docs/actions/running-actions.md`, `docs/tutorials/sequencing-and-scheduling.md`: `**Add sequence**` → `**New sequence**`.
* Update the tests above to query/expect `New sequence`.

Out of scope: released design docs and activity logs mentioning `Add sequence` (historical record).

## Acceptance criteria

* Desktop Home tab shows `New sequence` button; clicking opens sequence popup as before.
* Mobile `Create` menu lists `New card`, `New action`, `New diagram`, `New sequence` in that order.
* Enabled/disabled rules unchanged on both surfaces.
* No `Add sequence` text remains in `app/src` or `docs/`.
* Updated `app_menu.test.tsx` and `mobile_create_menu.test.tsx` pass.