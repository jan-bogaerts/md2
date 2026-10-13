---
id: B_260
internalId: ef3c3a56-28a9-4ca5-9402-16972e140c01
title: Source indentation is lost when returning to Rich text
status: new
---

Reported during review of [PR #29](https://github.com/jan-bogaerts/md2/pull/29), head `146ca4bb105c90cab3739d7f6356096608d6dfd8`. Fix after the PR is merged.

## Reproduction

1. Open a Markdown document containing `code` as an ordinary paragraph.
2. Switch to Source and add four leading spaces: `    code`.
3. Switch back to Rich text.
4. Add another paragraph and save.

Rich text still shows an ordinary paragraph instead of an indented code block. The subsequent rich edit exports `code` without its indentation, losing the Source change.

Expected: returning to Rich text imports the indented code block. Later edits, saving, and reopening preserve its code-block meaning; serialization may use a fenced code block.

## Cause and affected code

`MarkdownSourceController.setMode()` detects the Source change using exact comparison, but publishes `viewMode$` to let MDXEditor import it. MDXEditor's `setMarkdown$` compares trimmed strings and skips importing when only outer whitespace differs. Here, the leading whitespace changes Markdown meaning, so the rich document remains stale and its next export overwrites the Source edit.

Affected files: `app/src/components/editor/source/markdown_source_controller.ts` and the shared `markdown_editor.tsx` integration. MDXEditor's comparison is in `@mdxeditor/editor/dist/plugins/core/index.js`.

The fix must import meaningful Source whitespace changes while preserving untouched source, clean-state behavior, and the existing undo baseline rules. Do not treat whitespace-only differences as equivalent without considering Markdown meaning.

## Regression coverage

- Change a paragraph into an indented code block in Source, return to Rich text, and verify code-block rendering.
- Make an unrelated rich edit, save, and reopen; verify the code-block meaning survives.
- Verify viewing Source without editing preserves the original text and rich undo history.

The indentation loss was reproduced with a temporary regression probe against the installed MDXEditor in `markdown_editor_reliability.real.test.tsx`. The probe was removed after review. No fix is included in this report.
