---
author: 
id: F_409
internalId: 83f607ac-68ff-475d-add8-ebed6883551e
title: complete release broken
status: ready
owner: 
affects:
agents:
  - design/releases/0.8.0/card__83f607ac-68ff-475d-add8-ebed6883551e.json
policy:
changedFiles:
  - app/src/data/release_archiving.node.test.ts
  - app/src/data/release_archiving.ts
  - app/src/services/release_operations.service.test.ts
  - app/src/services/release_operations.ts
---

we are trying to run the 'complete release' command, but this got broken:&#x20;

`"ENOENT: no such file or directory, open 'C:\Users\janbo\Documents\dev\md2\design\feature_descriptions\pasted-image-….png'"`

this should not be a reason to prevent the release. it is just a missing image

## Current state

- `ReleaseOperations.completeRelease` selects release cards from already loaded cards using final configured state; it does not reread card files for selection. It then loads referenced assets because current move requests carry file contents. `findArchiveAssetPaths` collects local Markdown images and relative frontmatter `references`; it excludes assets still referenced by cards outside release.
- Desktop `loadProjectAsset` reads image bytes from disk. `ENOENT` means requested file does not exist. Error propagates through storage, so missing image aborts release before release commit. Bridge error transport already preserves string error codes.
- `buildReleaseMoves` delegates to `buildCardArchiveMoves`, which rejects unloaded assets. Catching image read failure alone therefore cannot fix release.
- Existing tests cover image moves, copied references, shared assets, and required activity logs; missing-image release recovery has no coverage.

## Implementation details

- Keep current release flow. When referenced image file does not exist, skip that file and continue release. No redesign of storage moves needed.
- In [release_operations.ts](../../app/src/services/release_operations.ts), handle `ENOENT` only around individual image loads. Image means path supported by `isSupportedAssetFileName` (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`). Continue loading remaining assets; return loaded files and normalized paths of confirmed missing images. Log warning with each skipped path and original error. Do not infer absence from error message or cached repository file list.
- In [release_archiving.ts](../../app/src/data/release_archiving.ts), pass confirmed missing-image paths through `buildReleaseMoves` to `buildCardArchiveMoves`. Exclude only those paths before asset target checks and content lookup. Missing files produce no move or placeholder. Preserve their Markdown links and frontmatter references; rewrite references only for assets actually moved.
- Shared-helper impact: `findArchiveAssetPaths` is called by release completion, individual card archiving, and `buildCardArchiveMoves`; keep discovery unchanged. `buildReleaseMoves` has one production caller, release completion; it receives missing-image paths. `buildCardArchiveMoves` is called by `buildReleaseMoves` and twice by [card_archive_operations.ts](../../app/src/services/data/card_archive_operations.ts); release omits confirmed missing images, individual card archiving keeps existing strict behavior. An explicit omitted-path input is justified by these different callers, not a general ignore-errors flag.
- Keep storage loaders and bridge contracts unchanged. Permission errors, unsupported asset errors, missing non-image attachments, missing required activity logs, and commit failures still fail release. Existing shared-asset rules, collision checks for actual moves, activity/statistics updates, push mode, branch cleanup, and lock release retain current behavior. Card identity remains `header.internalId`; asset paths identify files only.
- Add regression coverage in [release_operations.service.test.ts](../../app/src/services/release_operations.service.test.ts) and planner coverage in [release_archiving.node.test.ts](../../app/src/data/release_archiving.node.test.ts). Mock storage boundaries; run these test files independently and app lint. No full suite needed.

## Acceptance criteria

1. When one or several referenced images fail loading with `ENOENT`, Complete release still archives eligible cards and available assets, updates release summaries/statistics, and applies configured push and branch cleanup behavior.
2. Release commit contains no move or generated file for missing images. Archived card retains missing-image links/references unchanged, and warning identifies each skipped path.
3. Recovery also works when cached repository listing still contains missing image, when several release cards reference same missing image, and when missing image shares target filename with an available asset. Available asset still moves; normal collisions between actual moves still fail.
4. Existing images retain bytes and move once; images referenced by cards outside release remain in place. Successfully moved frontmatter references still point to archive destination.
5. Non-`ENOENT` image load errors and missing non-image attachments still abort before release commit. Required activity-log validation remains strict; release locks are released after success or failure. Individual card archiving retains existing missing-asset behavior.
6. Focused regression tests and app lint pass.
