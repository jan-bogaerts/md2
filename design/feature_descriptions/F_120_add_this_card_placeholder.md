---
author: 
id: F_120
internalId: 4d8ae085-bd65-46be-933d-83544fcf77fa
title: add this-card placeholder
status: design
owner: 
affects:
agents:
  - design/activity/card__4d8ae085-bd65-46be-933d-83544fcf77fa.json#conversation=agent-69f2b6f7-da40-4cdd-9729-b8069e3c6a58
policy:
---
add support for '{{this-card}} placeholder, which would be the same as {{card-file}}

## Current state

- Electron recognizes `{{card-file}}`, but not `{{this-card}}`. Because unknown placeholders remain literal, agent prompts and commands currently pass `{{this-card}}` through unchanged.
- Action prompt editors offer `{{card-file}}` through typeahead and toolbar insertion; `{{this-card}}` is absent from their shared placeholder catalog.
- User documentation describes only `{{card-file}}` for the selected Markdown card path.

## implementation details

- Add `this-card` to Electron's recognized card placeholder names. Resolve both `{{this-card}}` and `{{card-file}}` from the same required `context.file` value in the shared resolver, so stored prompts, edited prompts, and commands receive identical paths.
- Keep `{{card-file}}` supported without changed behavior. Keep existing whitespace-tolerant placeholder syntax and leave unknown placeholder names unchanged.
- When either file placeholder is used without file context, fail before process start with a clear missing-file-context error.
- Add `{{this-card}}` to the shared React placeholder catalog and describe it as an alias: an alternate name with the same resolved value as `{{card-file}}`. This exposes it in action-editor typeahead and toolbar insertion, and in Action popup typeahead.
- Document `{{this-card}}` beside `{{card-file}}`. Do not migrate bundled or saved action definitions; both names remain valid.
- Test shared resolution, missing context, prompt and command execution paths, and editor insertion availability.

## acceptance criteria

- Given card context with `file: 'design/card.md'`, both `{{this-card}}` and `{{card-file}}` resolve to `design/card.md` in agent prompts and action commands.
- Stored prompts and prompts edited in the Action popup resolve `{{this-card}}` before agent process start.
- Using either file placeholder without file context fails before any agent or command process starts.
- Existing `{{card-file}}` behavior and unknown-placeholder pass-through remain unchanged.
- Action-editor typeahead and toolbar insertion list `{{this-card}}`; Action popup typeahead also lists and inserts it.
- Placeholder documentation identifies `{{this-card}}` as an alias of `{{card-file}}` and gives both the same selected-card-file meaning.
