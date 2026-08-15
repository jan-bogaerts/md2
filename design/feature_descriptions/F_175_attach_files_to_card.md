---
author: 
id: F_175
internalId: 065a1db8-981d-4e22-8d62-8f8cc5995408
title: attach files to card
status: ready
owner: 
affects:
agents:
  - design/activity/card__065a1db8-981d-4e22-8d62-8f8cc5995408.json#conversation=agent-6dc3d891-a742-465b-900a-a1203e5956f1
  - design/activity/card__065a1db8-981d-4e22-8d62-8f8cc5995408.json#conversation=agent-468244b9-00b9-4ca0-a0b7-175ab045a3f6
policy:
after: bee2d3c7-81e1-451a-bc4d-d4ba59c849e9
branch: f_175_attach_files_to_card
worktree: 2
---
add possibility to attach files to a card.&#x20;

These files (or links to them) should be included in the prompt for the agent.

How to do this:&#x20;

* File is added to the 'references list, an optional card header field.
* &#x20; Drop file on card in board view
* &#x20; From context menu of card
* &#x20; Click on ´clip´ icon. New icon next to ´listview´ btn and run btn. Show different colors for no files vs has files
* Link is inserted in markdown text, at current cursor pos:
* &#x20; Drop file on markdown editor (all locations, so for action popup, new card  card editor, card popup)
* &#x20; From ´clip´ button on markdow toolbar

## Current state

Cards have no `references` domain field. Markdown parsing preserves unknown frontmatter, but UI and action execution cannot read or update a reference list.

Card and new-card editors already support pasted images through the focused flow described in [F_187_accept_paste_image.md](F_187_accept_paste_image.md). That flow copies supported clipboard images beside the card, inserts a relative image link, cleans up failed or cancelled draft saves, and lets archive/release move linked images. It does not handle dropped files, arbitrary file types, absolute paths, card-level references, or attachment controls. Action prompt editors intentionally do not use that paste-image flow.

Board cards use pointer-based card dragging plus a context menu. They have inline Run and file-mode buttons, but no attachment drop target, attachment menu item, or attachment indicator. Agent prompts currently contain resolved action text and user-entered prompt text only.

## implementation details

* Define a **card reference** as one entry in optional `references` frontmatter. An entry is either a repository-relative path for a copied file or an absolute filesystem path for a file kept at its original location. Preserve entry order and remove exact duplicates.
* Extend `CardHeader`, Markdown parsing, cloning, mutation, serialization, and granular card events with `references: string[]`. Missing `references` means an empty list. Keep `affects` and `agents` behavior unchanged.
* Add a focused attachment operation instead of broadening paste-only `CardImageOperations`. Existing clipboard image paste keeps its current behavior and never opens the file-drop choice dialog.
* When files are dropped, open one application dialog before writing anything. Explain both choices: **Copy beside card** copies each file into the card folder and stores a relative path; **Use original location** stores its absolute path and copies nothing. Cancel changes nothing. Apply one choice to all files from that drop.
* Resolve original paths through the Electron preload bridge; browser `File` objects do not expose trustworthy absolute paths. If an absolute path is unavailable, disable **Use original location** and explain why. Copy mode reads file bytes and supports arbitrary file types. Preserve the original base name, adding a collision-safe suffix when needed.
* Board-card drop adds resulting paths to card `references`. Add same attachment command to card context menu and a paperclip button beside Run and file-mode controls. Paperclip uses resting color when list is empty and primary color when list has entries; it has tooltip and accessible name.
* Markdown-editor drop inserts at current selection after user chooses copy or original location. Insert `![file name](<path>)` for images and `[file name](<path>)` for other files. Relative links use copied file name; original-location links use absolute file URL form. Add paperclip control to shared Markdown editor toolbar surfaces, including card body, list editor, new-card editor, and card action prompt. Hosts with hidden formatting toolbars still render attachment control.
* Card-scoped action prompt attachments use selected card as copy destination. New-card attachments use configured working folder and follow existing draft ownership: successful creation keeps copied files; cancellation removes copied draft files. Do not add copied Markdown links automatically to card `references`; Markdown links and card references remain separate user choices.
* Copy persistence must complete before adding frontmatter entry or Markdown link. If insertion or card update fails after copy, remove copied file and report cleanup failure through `dialogService`. Absolute-path choice performs no repository write.
* Before preparing or starting any card-scoped agent action, read current card `references` after pending card saves flush. Append a clearly labelled `Card references` path list to agent prompt. Keep repository-relative paths relative so they resolve in selected run worktree; keep absolute paths unchanged. Do not embed file contents. Command actions and non-card actions remain unchanged.
* Extend archive and release asset discovery to include copied repository-relative `references`, in addition to existing relative Markdown image links. Move each copied attachment with card only when no non-moved card still references same source path. Absolute references never move. Support arbitrary binary loading for these moves without weakening existing image validation used by pasted images.
* Keep external-file drop separate from internal card drag-and-drop. File drag-over must not start, move, or reorder card. Read-only projects accept neither copied nor absolute attachment changes.
* Add parser and mutation tests, attachment persistence and cleanup tests, Electron-path bridge tests, prompt-composition tests, archive/release tests, and user-centric UI tests for board cards and every Markdown editor host. Run app lint, app unit tests, directly affected UI tests, and affected desktop tests.

## acceptance criteria

* Dropping one or more files on card asks whether to copy files beside card or retain original absolute locations; cancelling leaves card and filesystem unchanged.
* Copy choice persists collision-safe files beside card and adds relative paths to `references`. Original-location choice copies nothing and adds absolute paths.
* Card context menu and paperclip control expose same attachment flow. Paperclip visibly distinguishes zero references from one or more references and remains accessible without color alone.
* Dropping file in card body, list editor, new-card editor, or card action prompt inserts Markdown link at current cursor position. Image uses image syntax; non-image uses normal link syntax.
* Existing clipboard image paste behavior remains unchanged and does not open drop-choice dialog.
* Copied new-card attachments survive successful creation and are removed after confirmed cancellation. Failure before link/reference insertion leaves no orphaned copied file.
* Card-scoped agent prompt contains current `references` paths after pending saves flush. Relative paths resolve from run worktree; absolute paths remain absolute. File contents are not duplicated into prompt.
* Releasing or archiving card moves copied referenced files with it while preserving working relative links. Absolute references remain untouched, and a copied file still referenced by non-moved card is not moved.
* External file drops never reorder cards. Read-only projects do not permit attachment changes.
* Existing `affects`, agent activity references, Markdown editing, card dragging, action execution, pasted-image persistence, and release/archive behavior remain unchanged outside attachment additions.
