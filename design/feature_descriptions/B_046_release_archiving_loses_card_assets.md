---
id: B-046
title: release archiving leaves card images behind, breaking relative links
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
The Remarkable integration stores imported images beside their card so the card can use relative links (`resolveCardAssetPath`, `app/src/data/asset_paths.ts`), and the architecture notes state the images "need to be copied over together with feature for release" (`design\architecture\initial description\remarkable.md`). But `buildReleaseMoves` (`app/src/data/release_archiving.ts`) moves only the active cards' `.md` files into `history/<release>/`. After completing a release:

- archived cards that reference imported images have broken relative links, and
- the orphaned images accumulate in the working folder with nothing pointing at them.

## Fix
- When building release moves, also move each archived card's referenced assets. Resolution options, pick one and document it: (a) parse relative image links out of each card body and move exactly those files, or (b) move every supported asset file (see `SUPPORTED_ASSET_EXTENSIONS`) that sits in the card's folder and is referenced by at least one archived card. Option (a) is more precise and keeps assets shared by a remaining card intact — prefer it, and only move an asset when no non-archived card still references it.
- Extend the collision checks: an asset move target that already exists inside the release folder is an error, same as for cards today.
- Storage services already support binary file moves for the import flow; reuse that path. Cover with unit tests for: card with images, card without images, two cards sharing an image where one stays active.

## acceptance criteria
- Completing a release moves archived cards and their referenced images into `history/<release>/`; relative image links inside archived cards still resolve.
- An image referenced by a card that stays active is not moved.
- Existing release collision/validation behavior is unchanged and all archiving tests pass.

## see also
- `design\architecture\initial description\remarkable.md`
- `design\feature_descriptions\ready\F_024_history_archiving.md`
- `design\feature_descriptions\ready\F_015_remarkable_integration.md`
