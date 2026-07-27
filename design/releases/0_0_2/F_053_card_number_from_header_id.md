---
id: F_053
title: next card number derives from header id, not filename
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: ca6646b7-b446-41ee-a1db-f98b6d4ba432
---

## Problem

`getNextCardNumber` in `app/src/data/card_naming.ts` computes the next available number for a card type by regex-matching each file's **path** (`PREFIX[-_]<digits>[-_]….md`) and returning `max + 1`. The filename is a weaker source of truth than the card's `id:` header:

- Every card file is already fully loaded with its content (and therefore its parsed header) at project load, so reading the header requires no extra file reads.
- When a project is seeded manually — or a file is renamed out of convention — the filename and the `id:` header can disagree. A file whose header says `id: F_017` but whose filename lacks the `F_017` prefix is **not counted**, so the next created card can reuse an id that is already in use. The same file is then also treated as an external-import candidate and renamed, compounding the confusion.
- The current pattern also silently accepts either separator (`-`/`_`) in the filename regardless of the configured `cardSeparator`, which is another way filename-derived numbering drifts from the header.

The header `id:` is what the rest of the app treats as the card's canonical identifier, so numbering should be derived from it.

## Fix

- Change `getNextCardNumber(files, idPrefix)` to derive numbers from the parsed `id:` **header** of each loaded file rather than from the filename:
  - parse each file's header (content is already in memory), read the `id` field, split it into prefix + trailing number using the existing `getCardIdPrefix` / card-id helpers in `app/src/data/card_identifiers.ts`;
  - keep only files whose id prefix equals `idPrefix`, and return `max(number) + 1`, or `1` when none match.
- For files with **no** `id:` header (genuinely external / non-conforming files that are about to be imported), do not count them — they must not inflate the next number, matching today's behavior for external-import candidates (see `planExternalCardImports`).
- Both call sites (`createCardFile` in `card_naming.ts` and `planExternalCardImports` in `app/src/services/external_card_import_service.ts`) already receive `MarkdownFile[]` with content loaded, so no signature change or extra reads are needed.
- Numbering stays per-prefix / per-card-type and continues to scan the whole project including subfolders and archived history cards.

## Edge cases

- A file whose header id and filename number disagree: the header wins for numbering, so the header value is never reused.
- A file with a malformed or missing `id:` header: skipped for counting (falls through to the external-import path unchanged).
- A card whose id uses a different prefix (e.g. counting `F` must ignore `B`/`J`): unchanged — filtering is by prefix.
- Both `-` and `_` separators must be handled when parsing the header id, since existing projects may still contain legacy hyphen ids.

## acceptance criteria

- Creating a card computes the next number from the maximum `id:` header value for that prefix, not the filename; a project whose files are named inconsistently with their headers still gets a non-colliding next id.
- A seeded file with header `id: F_017` but a non-conforming filename is counted, so the next feature card is `F_018`, never a duplicate of an existing header id.
- Files with no `id:` header are still imported as new cards and do not affect the next-number calculation.
- Per-type independence, subfolder/history inclusion, and the configured separator behavior are preserved.
- Tests cover: header-derived numbering, header/filename disagreement, missing-header skip, per-prefix independence, and legacy hyphen ids.

## see also

- `app/src/data/card_naming.ts`
- `app/src/data/card_identifiers.ts`
- `design/feature_descriptions/ready/B_026_external_files_not_imported.md`
- `design/feature_descriptions/ready/F_021_parsing_service.md`
