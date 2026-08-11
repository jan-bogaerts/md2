---
author: 
id: F_168
internalId: 32276926-4cff-486d-88bb-a98fbe1bfd8a
title: copy as markdown
status: ready
owner: 
affects:
agents:
  - design/activity/card__32276926-4cff-486d-88bb-a98fbe1bfd8a.json#conversation=agent-99e46a0c-8fe3-4d92-8257-0c9b9f2d1dc8
  - design/activity/card__32276926-4cff-486d-88bb-a98fbe1bfd8a.json#conversation=agent-32e36851-e8e8-4730-8609-87d9ae57dd6c
policy:
after: 012efbb1-c938-4539-a646-0f263e72dea6
---

it seems when copying text from the markdown editor, it currently pastes as regular text, the markdown formatting is gone.

so that is copy in our editor, paste in ours or paste in another file.

ideally, we should support copy (markdown) and copy as text.

same for paste.

## Current state

- `MarkdownEditor` is shared by card bodies, text-view cards, action prompts, action definitions, new-card drafts, and read-only card diffs.
- Lexical's default copy writes rendered text to `text/plain` and may also write HTML and Lexical-specific data. It does not write Markdown source, so Markdown markers such as `**`, `#`, and link destinations are lost when another Markdown file consumes the plain value.
- The existing `markdownPastePlugin` handles paste for every `MarkdownEditor`. It prefers `text/markdown`, then parses `text/plain` as Markdown through `MDXEditor.insertMarkdown`.
- Result: paste already accepts explicit Markdown clipboard data, but copy from this editor does not produce it. No separate copy-as-text or paste-as-text command exists.

## implementation details

- Add shared Markdown clipboard handling to `MarkdownEditor`; do not add separate behavior to each consumer. Existing `markdownPastePlugin` has one call site, in `MarkdownEditor`, so it should receive the new behavior without a compatibility mode.
- On Windows, `Ctrl+C` copies selected content as Markdown source. Write that source to both `text/markdown` and `text/plain`; `text/plain` lets plain file editors receive visible Markdown syntax. Prevent Lexical's default copy only after serialization succeeds.
- `Ctrl+Shift+C` copies rendered selection text to `text/plain`, without Markdown or HTML formatting. "Rendered text" means visible characters, with structural line breaks, but without Markdown markers or hidden link destinations.
- Serialize only selected characters while retaining required Markdown syntax around them. Use the editor's Markdown model and export configuration, not rendered DOM HTML. Support every construct enabled in `MarkdownEditor`: headings, emphasis, lists, quotes, links, images, tables, thematic breaks, inline code, and fenced code blocks.
- Keep current `Ctrl+V` behavior: prefer `text/markdown`; otherwise treat `text/plain` as Markdown. Insert at current selection, replacing selected content.
- `Ctrl+Shift+V` inserts `text/plain` literally. "Literally" means Markdown punctuation remains visible and is not converted into formatting. Preserve line breaks and replace current selection.
- Track shifted copy or paste intent only for next matching clipboard event, then clear it. Do not let a stale shortcut change later mouse- or menu-initiated clipboard behavior.
- With empty selection, copy leaves browser/Lexical behavior unchanged. Read-only editors allow copy but never paste. Unsupported or non-text clipboard data remains available to Lexical's existing handling.
- Report serialization or clipboard failures through `dialogService`. Markdown parse failures continue through existing `MarkdownEditor` error handling.
- Add focused tests for Markdown and text copy payloads, Markdown MIME priority, literal paste, selection replacement, partial formatted selections, collapsed selections, read-only behavior, and one-shot shortcut state. Update editor test stubs only as needed to dispatch copy and keyboard commands.

## acceptance criteria

- Given selected formatted content containing a heading, bold text, a link, a list, and code, `Ctrl+C` writes equivalent Markdown to both `text/markdown` and `text/plain`.
- Pasting that clipboard data with `Ctrl+V` into another MD² editor recreates formatting and content at current selection. Pasting into a plain file editor produces Markdown source.
- `Ctrl+Shift+C` writes only visible plain text. Link text remains, link destination and Markdown markers do not.
- `Ctrl+Shift+V` pastes `**bold**` as eight visible characters and does not create bold formatting. `Ctrl+V` with same plain value creates bold text.
- Partial selection copies only selected characters and enough surrounding Markdown syntax to preserve their formatting; unselected sibling text is absent.
- Copy works from editable and read-only Markdown surfaces. Paste changes editable surfaces only and replaces any current selection.
- Collapsed selection, non-text clipboard data, or failed Markdown serialization does not erase existing clipboard data or change editor content. User-visible failures use `dialogService`.
- Clipboard behavior is consistent across all editable `MarkdownEditor` consumers; no Electron bridge, persistence change, or per-consumer clipboard implementation is added.
