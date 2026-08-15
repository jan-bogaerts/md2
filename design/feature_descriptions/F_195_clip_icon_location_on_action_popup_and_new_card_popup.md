---
author: 
id: F_195
internalId: 8fc5eed5-9fc2-43a1-95d7-66c0aabd5d31
title: clip icon location on action popup and new card popup
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__8fc5eed5-9fc2-43a1-95d7-66c0aabd5d31.json#conversation=agent-2cda9a0b-365d-47c7-b708-319e26e21d15
policy:
---
The clip icon has been placed horribly bad on the action popup and the new card popup. it appears to have been placed simply above the markdown editor. this is horrible.

* on the new card popup: on the bottom row, in front of the `add to` select input.
* on the action popup: on the bottom row, first in the row

## Current state

`MarkdownEditor` appends `MarkdownAttachmentToolbarControl` whenever an `attachmentHandler` exists. New-card and action-prompt editors both set `hideToolbar`, so MDXEditor creates a toolbar containing only paperclip above editable text.

New-card `DialogActions` currently starts with `NewCardColumnPicker`, whose visible label is **Add to**, followed by Cancel and Create controls. On mobile, footer stacks column picker above Create. Action prompt renders `ActionPopupBottomRow` below scrolling editor; row currently starts with agent selectors, then usage summary and run controls.

Attachment workflows already open multi-file picker, ask whether files should be copied or kept at original location, and insert resulting Markdown at editor selection. Card-body and list editors intentionally keep paperclip in Markdown toolbar. This feature changes placement only. Here, **first** means earliest visual and DOM position in footer reading order.

## implementation details

* Make `MarkdownAttachmentToolbarControl` placement-neutral, including its tooltip, accessible name, hidden multi-file input, disabled state, and input reset behavior. Rename file if needed so name no longer claims toolbar ownership.
* Expose existing `MarkdownEditor` attachment operation through `MarkdownEditorHandle`. External paperclip must call same operation used by toolbar and file drop, preserving current selection insertion and `dialogService` error reporting.
* Add explicit Markdown-editor option to suppress built-in attachment toolbar control without disabling file drop or attachment workflow. Verified call sites differ: card-body and list editors keep built-in toolbar control; new-card and action-prompt editors suppress it and render external footer control. Do not change other toolbar controls.
* In `NewCardDialog`, render paperclip immediately before `NewCardColumnPicker` in footer start group. Desktop keeps this group left of Cancel/Create. Mobile keeps paperclip and **Add to** in one first footer row, with picker taking remaining width and Create staying below.
* In action prompt, pass paperclip created from prompt editor attachment operation into `ActionPopupBottomRow` as leading control. Render it before agent selectors, usage summary, Schedule, Send, Finish, Stop, or Run controls. When current action context has no attachment handler, render no paperclip and keep existing row order.
* Keep attachment choice, copy/cleanup ownership, Markdown syntax, drag-and-drop, cursor insertion, action execution, new-card submission, footer button order, and read-only behavior unchanged.
* Update focused tests for shared control and editor handle, new-card desktop/mobile footer order, action-footer order and conditional absence, preserved file selection/insertion, unchanged drops, and unchanged card-body/list toolbar placement.

## acceptance criteria

* New-card popup shows paperclip immediately before **Add to** in footer. On mobile, both controls share first footer row and Create remains below.
* Card- or file-scoped agent action popup shows paperclip as leftmost footer control, before agent settings and usage. Unsupported contexts and command actions show no attachment control.
* New-card and action-prompt editors show no paperclip toolbar above editable text.
* Activating relocated paperclip accepts multiple files, opens existing attachment-location choice, and inserts resulting Markdown at current editor selection. Cancel and failures keep existing behavior.
* Dropping files on either editor keeps working without toolbar being visible.
* Card-body and list editors retain paperclip in Markdown toolbar. Their attachment behavior and placement do not change.
* Tooltip, `Attach files` accessible name, disabled state, responsive footer layout, **Add to**, Cancel, Create, agent settings, usage, and run controls remain usable.
