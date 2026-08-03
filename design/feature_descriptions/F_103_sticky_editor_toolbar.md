---
author: 
id: F_103
internalId: 2d44bfea-2083-4ec7-b549-3fd4d02f4af9
title: sticky editor toolbar
status: design
owner: 
affects:
agents:
  - design/activity/card__2d44bfea-2083-4ec7-b549-3fd4d02f4af9.json#conversation=agent-08ae6c0f-7987-4974-a3fa-3f0d9da4884e
policy:
after: dc388d9d-a25d-4e74-bc32-71325cefa426
---

The markdown editor toolbar is not sticky, it just scrolls out of view. can we change it so that it remains at the top of the markdown editor

## Current state

`MarkdownEditor` supports an opt-in `stickyToolbar` prop. List-card editing and mobile card popups enable it, but desktop card popups and action Markdown editing do not, so their toolbars scroll out of view with long content.

## implementation details

- Make the shared `MarkdownEditor` toolbar sticky by default whenever the toolbar is rendered; remove the per-caller opt-in.
- Pin it to the top of its existing scroll container with sufficient background and stacking order for content to pass underneath.
- Keep toolbar-hidden editors, formatting controls, editor persistence, and surrounding headers and footers unchanged.
- Update shared editor and affected caller tests for uniform sticky behavior.

## acceptance criteria

- Formatting toolbar remains visible while scrolling long Markdown in list-card, action, and card-popup editors on desktop and mobile.
- Toolbar stays within its editor area and does not cover popup or page headers.
- Editors with `hideToolbar` still render no toolbar.
- Existing formatting, editing, save, fullscreen, and responsive behavior remains unchanged.
