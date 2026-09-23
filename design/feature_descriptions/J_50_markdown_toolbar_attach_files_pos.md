---
author: 
id: J_50
internalId: 64876822-b48e-450e-b7c7-68fd8d2ba6bd
title: markdown toolbar attach files pos
status: ready
owner: 
affects:
agents:
  - design/activity/card__64876822-b48e-450e-b7c7-68fd8d2ba6bd.json
policy:
after: 4d894c57-e88c-49fc-8bb4-2533b8ee9ef6
branch: j_50_markdown_toolbar_attach_files_pos
worktree: 3
---
the `attach files` button on the markdown toolbar should be in the same group as `create link` is, if possible

## Current state

* `MarkdownAttachmentControl` (`app/src/components/editor/markdown_attachment_control.tsx`) renders the paperclip `Attach files` button plus a hidden file input.
* `MarkdownEditor.toolbarContents` (`app/src/components/editor/markdown_editor.tsx`) renders the format toolbar first (custom `toolbarContents()` or default `MarkdownFormatToolbarControls`), then appends `MarkdownAttachmentControl` after everything. The button is shown when `attachmentHandler` is set and `hideAttachmentControl` is false; it is disabled, not hidden, when `readOnly`.
* `MarkdownFormatToolbarControls` (`app/src/components/editor/markdown_format_toolbar_controls.tsx`) renders the link group as `Separator`, `CreateLink`, `Separator`. The whole editing section, including this group, is omitted when `readOnly`.
* Result: the button sits at the far end of the toolbar, after `endControls`. On the card popup (`CardPopupToolbarControls`), that means after the flex spacer, card properties and fullscreen buttons. On the list editor (`ListEditorToolbarControls`), after Agents, commit menu and card properties.
* Surfaces with a visible toolbar attach button: list-card editor (`CardEditor`) and board-card popup body (`CardBodyEditor`). New-card dialog and action prompt pass `hideToolbar` + `hideAttachmentControl` and render their own `MarkdownAttachmentControl` outside the editor toolbar; they are out of scope.
* Only production custom toolbar without attachments: action phrase toolbar (`action_editor_navigation.tsx` → `ActionPhraseToolbarControls`).

## Implementation details

1. `MarkdownFormatToolbarControls`: add optional prop `onAttachFiles?: (files: File[]) => void`. When set (and not `readOnly`), render `<MarkdownAttachmentControl disabled={false} onFiles={onAttachFiles} />` directly after `<CreateLink />`, before the closing `Separator` of the link group.
2. `MarkdownEditor`:
   * change `toolbarContents` prop type to `(toolbarContext: MarkdownToolbarContext) => ReactNode`, where `MarkdownToolbarContext = { onAttachFiles?: (files: File[]) => void }`. Define the interface in its own file next to `markdown_editor.tsx` or export it from `markdown_editor.tsx` (type only).
   * compute `onAttachFiles = attachmentHandler && !hideAttachmentControl ? attachFiles : undefined`.
   * toolbar visible (`!hideToolbar`): pass `{ onAttachFiles }` to `customToolbarContents`, or `onAttachFiles` to the default `MarkdownFormatToolbarControls`. Drop the trailing `MarkdownAttachmentControl` in this case.
   * toolbar hidden (`hideToolbar`) but attachment control allowed: keep current standalone `MarkdownAttachmentControl` (no link group exists, so "same group" is not possible). Keeps existing test `keeps attachment control visible when formatting toolbar is hidden...`.
3. `CardPopupToolbarControls` and `ListEditorToolbarControls`: add prop `onAttachFiles?`, forward to `MarkdownFormatToolbarControls`.
4. `CardBodyEditor` and `CardEditor`: toolbar callbacks accept `toolbarContext` and pass `toolbarContext.onAttachFiles` to their toolbar controls.
5. `ActionPhraseToolbarControls` path, `ActionEditor.toolbarContents` type (`app/src/components/actions/editor/action_editor.tsx`), `list_action_editor.tsx`: update type only; context ignored.
6. `app/src/test/mdx_editor_stub.tsx` unchanged: `toolbarPlugin` still receives a zero-argument `toolbarContents` from `MarkdownEditor`.

Read-only behavior change: button now hidden while `readOnly` (same as `CreateLink`), instead of shown disabled.

Edge cases:

* `readOnly` toggles at runtime: button disappears/appears with the link group; drops already ignored by `attachFiles` when `readOnly`.
* List editor with no active card: `ListEditorToolbarControls` returns `null`, so no attach button (today the button still shows alone). Drop and paste unchanged.
* Horizontal toolbar scroll (`HorizontalScrollArea`): button now in middle of toolbar; no layout change needed.

Tests:

* `markdown_format_toolbar_controls.grouped.test.tsx`: attach button rendered right after `create-link` when `onAttachFiles` set; absent without it and when `readOnly`; selecting files calls `onAttachFiles`.
* `markdown_editor.grouped.test.tsx`: custom `toolbarContents` receives `onAttachFiles` only with `attachmentHandler` and without `hideAttachmentControl`; no trailing standalone button when toolbar visible.
* Update mocks in `card_editor.test.tsx` (mock calls `toolbarContents()` and renders its own `Attach files` button) and check `card_body_editor.grouped.test.tsx` still finds `Attach files`.

## Acceptance criteria

* In board-card popup and list-card editor, `Attach files` button is directly after `Create link`, inside same separator group.
* No `Attach files` button remains at toolbar end on these surfaces.
* Clicking button opens file picker; selected files are attached and Markdown links inserted as before.
* Read-only project: button not shown in toolbar; file drop still does nothing.
* Editors with `hideToolbar` and an `attachmentHandler` (without `hideAttachmentControl`) still show standalone attach button.
* New-card dialog and action prompt attach buttons unchanged.
* Action phrase toolbar unchanged (no attach button).