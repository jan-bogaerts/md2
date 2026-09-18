---
author: 
id: B_213
internalId: 1d937bde-19d5-467d-ad73-67ef587493fe
title: double add link and add image buttons
status: ready
owner: 
affects:
agents:
  - design/activity/card__1d937bde-19d5-467d-ad73-67ef587493fe.json
policy:
---
on the toolbar of the markdown editor, we show the built in 'add link' and 'add image' buttons, but these are for web links, not for file links.&#x20;

we also have our own `insert file` button, which works better.

we should simplify and only use our insert file, with perhaps a variation to insert as image

## Current state

The shared format toolbar renders MDXEditor's built-in `CreateLink` and `InsertImage` buttons side by side (`app/src/components/editor/markdown_format_toolbar_controls.tsx:37-38`). Both open a URL dialog: the user must already know the address and type or paste it. Neither one opens a file picker, and neither one can produce a project-relative path, so they only serve web addresses.

md2 has its own file insertion control on the same toolbar: the paperclip "Attach files" button (`app/src/components/editor/markdown_attachment_control.tsx`). `MarkdownEditor` renders it at `app/src/components/editor/markdown_editor.tsx:390`, but only when the caller passes an `attachmentHandler` prop. It opens the OS file picker, then `AttachmentChoiceDialog` (`app/src/components/editor/attachment_choice_dialog.tsx`) asks whether to copy the files into the project or link them where they are.

`attachmentMarkdown` (`app/src/services/attachments/attachment_workflow.ts:25-34`) then writes the Markdown. It already decides image syntax against link syntax on its own: when the file's MIME type starts with `image/` it emits `![name](<target>)`, otherwise `[name](<target>)`. So for files, the "insert as image" case is already covered automatically, and `InsertImage` adds nothing the paperclip does not do better.

`CreateLink` is not redundant in the same way. It is the only control that inserts a plain web address such as [`https://example.com`](https://example.com), and it is the only insert control present at all in the editors that pass no `attachmentHandler`: the list action editor (`app/src/components/actions/editor/list_action_editor.tsx:79`), the instruction editor (`app/src/components/text_view/instruction_editor.tsx:15`), and the predefined phrase editors (`app/src/components/actions/editor/action_phrase_toolbar_controls.tsx:40`). Those toolbars show no paperclip, so removing `CreateLink` there would leave them with no way to insert a link.

A third, unrelated mechanism also exists and stays untouched: typing `@` opens the repository file search typeahead (`app/src/components/editor/markdown_file_search_trigger.ts`), which inserts a repository-relative link through `replaceFileSearchQuery` (`app/src/components/editor/markdown_file_search_selection.ts`).

## implementation details

* Remove the `<InsertImage />` element and its import from `app/src/components/editor/markdown_format_toolbar_controls.tsx`. That is the only production use of the symbol.
* Keep `<CreateLink />` exactly where it is, for web addresses and for the toolbars that render no paperclip.
* Keep the `Separator` layout readable after the removal: `CreateLink` now stands alone in that group.
* Keep `imagePlugin()` in the plugin list of `app/src/components/editor/markdown_editor.tsx`. It is what renders and edits image nodes in the document; only the toolbar button goes away, not image support.
* Leave the paperclip control, `AttachmentChoiceDialog`, and `attachmentMarkdown` unchanged. The MIME-based choice between `![...]` and `[...]` stays automatic; no new "insert as image" variation is added.
* `export const InsertImage = NoopControl` in `app/src/test/mdx_editor_stub.tsx:420` may stay. It is a test stub mirroring the upstream module surface, and removing it is not required by this change.
* Tests: assert the format toolbar renders no "Insert image" button, and assert the "Create link" button and the paperclip "Attach files" button both still render where they did before.

## acceptance criteria

* The markdown editor toolbar shows no built-in "insert image" button in any surface that uses `MarkdownFormatToolbarControls`.
* The "create link" button still appears in every surface where it appeared before, including the editors that render no paperclip.
* Attaching an image file through the paperclip still inserts `![name](<target>)`, and attaching a non-image file still inserts `[name](<target>)`.
* Images already present in a document still render and remain editable, proving the image plugin was not removed with the button.
* Typing `@` still opens the repository file search and still inserts a repository-relative link.