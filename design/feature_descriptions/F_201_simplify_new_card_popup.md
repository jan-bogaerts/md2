---
author: 
id: F_201
internalId: c384fd87-648d-4bbd-b5df-cfc26f176388
title: Simplify new card popup
status: ready
owner: 
affects:
agents:
  - design/activity/card__c384fd87-648d-4bbd-b5df-cfc26f176388.json
policy:
after: bee2d3c7-81e1-451a-bc4d-d4ba59c849e9
branch: f_201_simplify_new_card_popup
worktree: 2
---

Simplify the new-card popup by removing the **Type** and **Description** labels, the bottom mobile create button, and card-body templates.

## Current state

`NewCardDialog` shows **Type** above the configured type pills and **Description** above the Markdown editor. Those labels also name their controls through `aria-labelledby`.

On mobile, the header contains a **Create** submit button and the footer contains a second full-width create button. Both submit the same form and use the same disabled state. Desktop has only the footer create button.

The description starts empty, but its label row contains a **Template** button backed by `project.cardBodyTemplate`. The template is part of `ProjectConfig`, defaults, settings, project-config loading and saving, dialog props, and card creation. `createCardFile` prepends it unless `CardDraft.bodyIncludesTemplate` says the body already contains it. New-card, Sentry-import, and Remarkable-import creation share that path.

## implementation details

- Remove the visible **Type** and **Description** labels. Give the type radiogroup and description editor direct accessible names so screen-reader naming does not depend on removed elements. Keep type pills, Markdown editing, and field order unchanged.
- On mobile, keep the header **Create** button as the only create control and remove the footer create button. Keep the footer attachment and **Add to** controls. Keep desktop Cancel and create controls unchanged.
- Remove the **Template**/**Clear** button, its untouched-template state and handlers, and the `cardBodyTemplate` dialog prop.
- Remove `cardBodyTemplate` from `ProjectConfig`, default data, config entries, project config keys, settings UI, config loading/saving, hooks, dialog callers, and import contracts. Ignore that obsolete property when reading an existing config and omit it on later saves.
- Remove `CardDraft.bodyIncludesTemplate` and the template argument from `createCardFile`. Persist the supplied body unchanged for normal, Sentry-imported, and Remarkable-imported new cards.
- Update focused dialog, card naming, config, Sentry import, and Remarkable import tests. Preserve title validation, `Ctrl+Enter`, cancellation confirmation, target-column selection, attachments, and draft cleanup.

## acceptance criteria

- New-card popup shows no visible **Type** or **Description** labels, while both controls retain accessible names.
- Mobile shows exactly one create control in the header and none in the footer. Desktop keeps its existing footer create control.
- Popup shows no **Template** or **Clear** button, and description opens empty.
- Project settings and newly saved project config contain no card-body-template option or field. Existing configs containing the obsolete field still load, but that field has no effect.
- Every newly created card body equals the body supplied by its creation flow; no template text is inserted before new-card, Sentry, or Remarkable content.
- Type selection, title validation, `Ctrl+Enter`, cancellation confirmation, **Add to**, attachments, and desktop button order keep current behavior.
