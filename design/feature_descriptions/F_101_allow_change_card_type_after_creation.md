---
author: 
id: F_101
internalId: f0fad88a-ea00-41be-aaf9-8f28a4cbdc31
title: allow change card type after creation
status: ready
owner: 
affects:
agents:
  - design/activity/card__f0fad88a-ea00-41be-aaf9-8f28a4cbdc31.json#conversation=agent-0df646d6-7dac-4371-adcf-3efdf75aee17
  - design/activity/card__f0fad88a-ea00-41be-aaf9-8f28a4cbdc31.json#conversation=agent-3f06363c-0669-4ff6-a794-cd65a4fb7365
policy:
after: 5205bb65-078a-411a-9647-0796ad14953c
---
It is currently not possible to change the card type after creation.

in the card-popup on the `board view`, we should add the same button 'properties' as on the card-editor on the `list-view` but lets use an icon for the button (everywhere).

on the properties page, there should be a dropdown to select the card type.

## Current state

- Card type is not stored separately. `getCardType` and card styling derive it from `header.id`'s configured prefix.
- Card creation selects a configured type and allocates its next prefix-specific number. No operation changes an existing card's ID or type.
- Properties exist only in the list-view toolbar, use a text button, and bind only to `list-card`. Board popup toolbar exposes formatting and fullscreen controls.
- Title changes already provide the required rename path: pending writes are flushed, file moves are committed separately, open documents follow stable `internalId`, and `cardPathChanged` updates path-based UI and acknowledgements.

## implementation details

- Add one reusable Properties icon control, with `Tooltip` and `aria-label`, to list and board editor toolbars. Replace list view's text button; use the same icon in both views. Control owns its popover state.
- Make `CardPropertiesPanel` accept `list-card` or `board-card` binding plus configured card types. Use that binding for all edits. Add a small `Select` showing every configured type and select current type by matching `header.id` prefix.
- Add `CardMarkdownDataSource.updateActiveCardType` and a matching card data operation. Selecting current type performs no write; unknown types fail clearly.
- Allocate next number for selected type with existing card-number logic, then build new ID from selected prefix and configured separator. Rewrite `id`, rename file in its current directory using unchanged title slug, and keep body, other header fields, `internalId`, status, ordering, and activity ownership unchanged.
- Serialize type and title renames. Flush pending edits first, commit header update and path move together, retain current path on failure, and publish `cardPathChanged` only after successful rename so board popup, list tab, selection, and acknowledgement paths follow card.
- Report UI and persistence failures through `dialogService`. Add operation/data-source tests plus list-view and board-popup component tests; run app lint and tests.

## acceptance criteria

- List editor and board card popup each show same icon-only Properties control with tooltip and accessible label; no Properties text button remains.
- Properties popup works for active card in either view and shows all configured card types, including custom types, with current type selected.
- Changing `F_101` to Bug allocates next available Bug ID, updates header ID and filename with configured separator, and immediately updates type-derived color and action context.
- Type change preserves title, body, remaining frontmatter, `internalId`, status/order, open editor/popup, conversations, and acknowledgement state.
- Selecting current type makes no persistence request. Unknown type, rename collision, or commit failure shows error and does not leave card at partially changed path.
- Tests cover both UI entry points, custom type options, no-op selection, next-ID allocation, successful open-document rename, and failure behavior.
