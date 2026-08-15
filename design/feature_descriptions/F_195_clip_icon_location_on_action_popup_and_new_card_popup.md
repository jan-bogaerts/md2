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
  - design/activity/card__8fc5eed5-9fc2-43a1-95d7-66c0aabd5d31.json#conversation=agent-9ec4aeeb-5fa2-43e9-bfc4-0f0987ff9df8
  - design/activity/card__8fc5eed5-9fc2-43a1-95d7-66c0aabd5d31.json#conversation=agent-8018c438-ee4a-4e7f-b623-431c297c745b
  - design/activity/card__8fc5eed5-9fc2-43a1-95d7-66c0aabd5d31.json#conversation=agent-8c7d557e-3ada-47d5-96ac-470ea4b49d66
policy:
branch: f_195_clip_icon_location_on_action_popup_and_new_card_popup
worktree: 3
---
The clip icon has been placed horribly bad on the action popup and the new card popup. it appears to have been placed simply above the markdown editor. this is horrible.

* on the new card popup: on the bottom row, in front of the `add to` select input.
* on the action popup: on the bottom row, first in the row

## Current state

`MarkdownEditor` appends `MarkdownAttachmentToolbarControl` whenever an `attachmentHandler` exists. New-card and action-prompt editors both set `hideToolbar`, so MDXEditor creates a toolbar containing only paperclip above editable text.

New-card `DialogActions` currently starts with `NewCardColumnPicker`, whose visible label is **Add to**, followed by Cancel and Create controls. On mobile, footer stacks column picker above Create. Action prompt renders `ActionPopupBottomRow` below scrolling editor; row currently starts with agent selectors, then usage summary and run controls.

Attachment workflows already open multi-file picker, ask whether files should be copied or kept at original location, and insert resulting Markdown at editor selection. The inserted link is deliberately the complete attachment representation: users can see and remove it in the Markdown instead of requiring separate attachment-list UI. Card-body and list editors intentionally keep paperclip in Markdown toolbar. This feature changes placement and removes direct footer-to-editor coupling. Here, **first** means earliest visual and DOM position in footer reading order.

Action prompts already use service-owned `ActionPromptDraft` state, but new-card Markdown remains inside the mounted editor and is read through `MarkdownEditorHandle`. `ActionPromptDraft` also contains action-specific preparation, run binding, synchronization, and sending behavior, so renaming that complete class to `MarkdownDraft` would incorrectly make those responsibilities appear generic.

## implementation details

* Introduce a generic service-owned Markdown draft contract for current Markdown value, edits, external replacement, and insertion requests. Keep action-only preparation, run binding, synchronization, and sending on `ActionPromptDraft`; it may use the generic draft behavior without presenting those action responsibilities as generic Markdown behavior.
* Give the new-card flow a lifetime-stable Markdown draft owned by a service. `NewCardDialog` and `NewCardMarkdownEditor` use that draft instead of reading or resetting body Markdown through `MarkdownEditorHandle`.
* Send granular insertion requests through the draft's `EventTarget`. The mounted `MarkdownEditor` uses a focused hook to observe its draft and applies the request at its current selection. Do not pass an editor ref, editor operation, or insertion callback from either footer to its editor.
* An insertion request returns an acknowledgement promise. The editor acknowledges after accepting the insertion and rejects when it cannot apply it. A request with no mounted editor must fail instead of silently succeeding. The attachment workflow retains ownership of copied-file cleanup when insertion is rejected or fails.
* Keep attachment choice, copying, Markdown generation, and cleanup in attachment/data services. UI controls only collect selected files and start the service operation against the applicable draft; they do not read, concatenate, or maintain Markdown or attachment data.
* Make `MarkdownAttachmentToolbarControl` placement-neutral, including its tooltip, accessible name, hidden multi-file input, disabled state, and input reset behavior. Rename file if needed so name no longer claims toolbar ownership.
* Add an explicit Markdown-editor option to suppress the built-in attachment control without disabling file drop or attachment workflow. Verified call sites differ: card-body and list editors keep the built-in control; new-card and action-prompt editors suppress it and render an external footer control. Do not change other toolbar controls.
* In `NewCardDialog`, render a paperclip bound to the new-card Markdown draft immediately before `NewCardColumnPicker` in the footer start group. Desktop keeps this group left of Cancel/Create. Mobile keeps paperclip and **Add to** in one first footer row, with picker taking remaining width and Create staying below.
* In the action prompt, bind the footer paperclip to the current action prompt draft and render it in `ActionPopupBottomRow` before agent selectors, usage summary, Schedule, Send, Finish, Stop, or Run controls. When the current action context cannot produce Markdown attachments, render no paperclip and keep the existing row order.
* Keep attachment choice, copy/cleanup ownership, Markdown syntax, drag-and-drop, cursor insertion, action execution, new-card submission, footer button order, and read-only behavior unchanged.
* Update focused tests for the shared control, generic draft insertion and acknowledgement, failed/unhandled insertion cleanup, service-owned new-card Markdown, new-card desktop/mobile footer order, action-footer order and conditional absence, preserved file selection/insertion, unchanged drops, and unchanged card-body/list toolbar placement.

## acceptance criteria

* New-card popup shows paperclip immediately before **Add to** in footer. On mobile, both controls share first footer row and Create remains below.
* Card- or file-scoped agent action popup shows paperclip as leftmost footer control, before agent settings and usage. Unsupported contexts and command actions show no attachment control.
* New-card and action-prompt editors show no paperclip toolbar above editable text.
* Activating relocated paperclip accepts multiple files, opens existing attachment-location choice, and inserts resulting Markdown at current editor selection. Cancel and failures keep existing behavior.
* Footer attachment controls communicate through the applicable Markdown draft and do not receive or call a `MarkdownEditorHandle`.
* New-card body Markdown remains available through its service-owned draft while the editor is mounted or unmounted.
* Copied files are removed when the resulting insertion is rejected, fails, or has no mounted editor to handle it.
* Dropping files on either editor keeps working without toolbar being visible.
* Card-body and list editors retain paperclip in Markdown toolbar. Their attachment behavior and placement do not change.
* Tooltip, `Attach files` accessible name, disabled state, responsive footer layout, **Add to**, Cancel, Create, agent settings, usage, and run controls remain usable.
