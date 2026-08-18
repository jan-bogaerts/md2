---
author: 
id: F_197
internalId: 879cfc1a-7a44-48a4-b533-196cd4975252
title: Hide attach icon on small screen
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__879cfc1a-7a44-48a4-b533-196cd4975252.json
policy:
after: 5d0cd5cb-d69f-4e88-a662-45dfeb6f421b
---
When in small screen mode (mobile), the action popup bottom row does not have enough space, so hide its clip icon. This applies only to the action popup; keep the clip icon on the card popup unchanged.

## Current state

`ActionPopupFrame` defines mobile mode with MUI's `theme.breakpoints.down('md')` media query and makes the action popup fill the viewport. `ActionPopupBottomRow` still renders the **Attach files** paperclip for agent actions when the action popup is opened from card and project contexts. The same row must also fit agent selectors, usage, schedule, and run controls, so the paperclip consumes scarce width on mobile.

The card popup owns a separate attachment control. That control is outside this feature and remains visible on mobile.

Command actions have no attachment control. Agent prompt editors hide their built-in toolbar attachment control and use the bottom-row paperclip instead. Attachment selection inserts a Markdown link through the existing prompt-draft and attachment workflow.

## implementation details

- In `app/src/components/actions/run/popup/action_popup_bottom_row.tsx`, use MUI's theme and `useMediaQuery(theme.breakpoints.down('md'))` to detect mobile mode. This is the existing application definition of a small screen; a narrow desktop popup does not count as mobile.
- Render `MarkdownAttachmentControl` only for agent actions outside mobile mode. Apply this to both embedded agent rows and non-embedded rows, and to card-scoped and project-scoped action popups.
- Do not change the card popup or its attachment control.
- Keep attachment handlers, Markdown insertion, file copying, error reporting, prompt preparation, and file-drop behavior unchanged. Keep selectors, usage, schedule, Send, Run, Stop, and Finish controls unchanged.
- Update `action_popup_bottom_row.test.tsx` with media-query coverage proving the paperclip is absent on mobile and present on larger screens. Keep existing command-action coverage proving commands never show it.

## acceptance criteria

- On screens matching `theme.breakpoints.down('md')`, agent action popups show no **Attach files** paperclip in the bottom row for card or project contexts.
- Mobile embedded and non-embedded bottom rows keep all existing non-attachment controls and behavior.
- On larger screens, agent action popups keep the **Attach files** paperclip in its current position and retain the existing attachment workflow.
- The card popup keeps its clip icon at every screen size.
- Resizing a desktop action popup to a narrow width does not hide the paperclip unless the viewport itself matches the mobile breakpoint.
- Command action popups continue to show no attachment control at any screen size.
- Focused component tests verify mobile absence, larger-screen presence, both agent contexts, and unchanged command behavior.
