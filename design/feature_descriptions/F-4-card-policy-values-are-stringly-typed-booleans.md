---
id: F-4
title: card policy values are stringly typed booleans
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: fbfbb826-f3ce-461b-b33b-175cf4cd9b92
---

## Problem
Card policies are parsed into `Record<string, string>` and consumers compare raw strings: `card.header.policy[policyKey] === 'true'` (`app/src/components/card_view/project_card_view.tsx`, `PolicyLed` usage). Any header that says `True`, `yes` or `1` silently renders as "off", and every consumer must know the magic string. This is the same class of defect B-036 fixed for config values (typed per key at the boundary).

## Fix
- Parse policy values to `boolean` in `markdownParsingService` (accept the values we intend to support, e.g. case-insensitive `true`/`false`; decide and document what a non-boolean value means — suggest: treat as `false` and surface a parse warning).
- Change the `ProjectCard` header type to `policy: Record<string, boolean>` and update consumers (`PolicyLed`, toggle handler, serialization back to the header on toggle).
- Serialization on save must write the canonical `true`/`false` strings so round-trips normalize legacy casing.

## acceptance criteria
- No production code compares policy values against string literals.
- A header with `checkLinting: True` renders the led as enabled and is normalized to `true` on the next save of that card.
- Parsing, toggle and serialization covered by unit tests.

## see also
- `design\feature_descriptions\ready\B_036_config_values_not_typed_per_key.md`
- `design\feature_descriptions\ready\F_021_parsing_service.md`
