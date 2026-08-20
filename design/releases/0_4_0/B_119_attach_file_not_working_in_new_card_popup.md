---
author: 
id: B_119
internalId: dffba4e6-6ec5-4a40-8ee7-e68d4891aff3
title: attach file not working in new card popup
status: ready
owner: 
affects:
agents:
  - design/releases/0_4_0/card__dffba4e6-6ec5-4a40-8ee7-e68d4891aff3.json
policy:
after: 16e415b8-8ab2-4050-bb45-c6c37c0c3465
---

in the new-card popup, when clicking on the clip icon, we can select a file, but no link is inserted in the markdown text. nothing happens. then, when I cancel the card and try to create a new card, inputs don't work: not possible to enter title or type in markdown editor.

## Current state

New-card footer paperclip starts `attachFilesToNewCardMarkdown`, then routes generated link through `MarkdownDraft.requestInsertion` to mounted `MarkdownEditor`. `MarkdownEditor` calls MDXEditor's imperative `insertMarkdown` without first establishing editor focus or a Lexical selection. **Lexical selection** means current cursor or selected text range inside editor.

MDXEditor's insertion command inserts only when that selection exists. Attachment-location dialog and native file picker move focus away; if user never placed cursor in description editor, selection is `null`. Command then inserts nothing but returns no failure, so draft request is acknowledged and copied attachment is retained without Markdown link.

Current tests cover insertion at existing cursor and missing mounted editor. They do not cover attachment selection before editor receives focus, nor cancelling and reopening new-card dialog after this path. No new-card code intentionally disables title or body inputs after reopen, so reported lock is downstream regression requiring integration coverage.

## implementation details

* Change shared `MarkdownEditor` insertion boundary so each external Markdown insertion first focuses MDXEditor. Preserve valid cursor or text selection; when none exists, create selection at document end before inserting.
* Keep `MarkdownDraft.requestInsertion` acknowledgement semantics: acknowledge only after mounted editor accepts insertion; reject missing editor or insertion error so copied-file cleanup in `copyAndApplyAttachments` still runs.
* After successful footer attachment, update `newCardMarkdownDraft` through existing editor `onChange` path. Link format, copy/original choice, collision handling, draft attachment ownership, and error reporting remain as defined by [F_175_attach_files_to_card.md](F_175_attach_files_to_card.md).
* Shared insertion call sites are draft requests, file drops and paperclip actions, pasted images, and Markdown paste. Existing cursor-based behavior stays unchanged for all. Only missing-selection behavior changes: append at document end. No compatibility flag is needed because all call sites need deterministic insertion.
* Closing new-card dialog must leave no attachment-choice modal, focus trap, pending insertion, or stale editor binding that can intercept reopened dialog. Existing confirmed-cancel cleanup still removes copied draft attachments.
* Add focused tests for shared editor insertion with no prior focus and with existing selection. Add new-card integration regression covering untouched editor, attachment choice, visible appended link, confirmed cancel, reopen, title typing, and body typing. Keep copied-file cleanup test for rejected insertion.

## acceptance criteria

* Selecting file from new-card paperclip before clicking description editor inserts generated Markdown link at document end.
* If description editor has cursor or selected text, attachment inserts at that selection instead of document end.
* Copy and original-location choices both insert correct image or normal-link syntax. Cancelling attachment-location choice changes neither draft nor filesystem.
* Successful copied attachment remains owned by new-card draft; failed insertion removes copied file and reports error.
* After attachment attempt, cancelling new card and opening another new-card dialog leaves title and Markdown body editable.
* Reopening dialog starts with cleared draft and no stale attachment dialog, pending insertion, focus trap, or editor subscription.
* Existing file drop, toolbar attachment, Markdown paste, pasted-image, cursor insertion, template, card creation, and draft cleanup behavior remain unchanged.
