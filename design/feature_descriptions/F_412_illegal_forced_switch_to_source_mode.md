---
author: 
id: F_412
internalId: e5a9c51e-b832-48b9-9e71-e83cc4468433
title: illegal forced switch to source mode
status: ready
owner: 
affects:
agents:
  - design/activity/card__e5a9c51e-b832-48b9-9e71-e83cc4468433.json
policy:
after: 78b279d6-eae4-4801-92c0-a6423a1fc880
branch: f_412_illegal_forced_switch_to_source_mode
worktree: 1
changedFiles:
  - .f_412_limit_fs.cjs
  - app/src/components/editor/markdown_editor.grouped.test.tsx
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/editor/markdown_editor_reliability.real.test.tsx
  - app/src/components/editor/paste/markdown_paste_plugin.tsx
  - app/src/components/editor/plain_markdown_realm_plugin.ts
  - app/src/components/editor/source/markdown_source_controller.ts
  - app/src/components/editor/source/markdown_source_realm_plugin.ts
  - app/src/components/editor/source/markdown_source_recovery.tsx
  - app/src/components/editor/source/mdxeditor_import_cells.d.ts
---
we recently introduced source mode for the markdown editors. this appears to be giving unwanted side effects.

i tried to paste some text into the editor and we got this error:

`This content needs Source mode. The existing document is preserved; paste or insert it again in Source.`

and switched to source input.

* we showed this error, which is wrong
* it should not switch to source mode just like that

the text we tried to paste: simply wont be accepted anymore, paste it in source mode, when switching back to rich-text, we loose the text.

```
Uncaught Error Error: No fields to update
    at update (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\public\storage\sqlite\sqlite_bundle_events_log.js:133:19)
    at EventLogger._internalSave (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:349:57)
    --- await ---
    at <anonymous> (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:272:32)
    at _runSaveLoop (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:280:10)
    at <anonymous> (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:201:24)
    --- setTimeout ---
    at trySaveToDb (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:199:23)
    at updateEvent (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\outputs\event_logger.js:97:18)
    at tryUpdateEvent (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\triggers\pipes\multi_event_detector.js:82:29)
    at _resolveAbsentDirections (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\triggers\pipes\connections\connections.js:139:18)
    at _handleFrame (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\triggers\pipes\connections\connections.js:110:14)
    at run (c:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\services\analysis\triggers\pipes\connections\connections.js:58:14)
    at _run (c:\Users\janbo\Documents\
```

the text started with: `& # x 60 ; & # x60 ; & #x60 ;` ( i put spaces between the letters so we can paste it in the editor without loosing it.

this is broken and bad experience. the editor should not switch, we should not show the error, should be able to paste the text,

## Current state

- Shared `app/src/components/editor/markdown_editor.tsx` uses MDXEditor with HTML processing disabled. `plain_markdown_realm_plugin.ts` rejects every parsed `html` node, including tags and comments. Raw HTML means source such as `<anonymous>` or `<div>text</div>`, rather than a Markdown code span or code block.
- Normal paste prefers `text/markdown`, then parses `text/plain` as Markdown. Shared insertion calls `MarkdownSourceController.validateRichInsertion()` before inserting. HTML rejection makes that method select Source and throw the reported error; paste then consumes the event without inserting content.
- Document loading and Source-to-Rich conversion use the same rejecting visitor. `markdown_source_realm_plugin.ts` observes conversion errors and calls `recover()`, which also selects Source. `markdown_source_recovery.tsx` reports an error. Existing real-editor tests explicitly expect these forced switches.
- Parser check reproduces the reported cause: `&#x60;&#x60;&#x60;` decodes to three visible backticks but does not open a fenced code block. Later `<anonymous>` therefore parses as HTML and is rejected. Literal triple backticks do open a code block. This confirms rejection and switching; the reported subsequent text loss needs regression coverage through conversion, later edits, saving, and reopening.

## implementation details

- Use mixed rendering throughout: supported Markdown keeps formatting; HTML nodes become editable literal text. For `**bold** <div>text</div>`, bold remains formatted and the tag characters remain visible. Do not render HTML elements or discard comments.
- Replace rejection in `plain_markdown_realm_plugin.ts` with HTML-to-text import. Inline HTML joins its containing paragraph; block HTML becomes valid paragraph content, with explicit line breaks preserving its lines. Apply this visitor to opening, replacement, insertion, and Source-to-Rich conversion. Keep HTML processing disabled. Markdown-looking characters inside an HTML node's value remain literal.
- Shared call-site impact: `plainMarkdownPlugin()` has one registration in `MarkdownEditor`; all its import paths receive mixed rendering. `validateRichInsertion()` has one caller, shared `insertMarkdown`: clipboard text, clipboard images, draft insertion requests through `useMarkdownDraft`, and attachment selection/drop all retain insertion semantics and must never switch mode. Supported links, images, and formatting remain unchanged. Ctrl+Shift+V retains whole-fragment literal paste; Source insertion retains raw source text.
- Remove the mode change and retry-in-Source error from insertion validation. Keep validation before modifying the live document, using the same syntax extensions, Markdown-tree extensions, and visitors as actual insertion. Unexpected failures must reject insertion without changing document or selection; report real errors through `dialogService`.
- Remove automatic `recover()` invocation from `markdown_source_realm_plugin.ts` and its forced mode transition in `markdown_source_controller.ts`. Update `markdown_source_recovery.tsx` so genuine conversion failures preserve complete source, prevent partial rich content from replacing it, and offer explicit Source selection, including compact editors. Opening HTML is successful import and shows no error. Honor explicitly requested initial Source mode.
- Preserve current draft/data-source ownership, dirty tracking, and history rules. Opening or viewing another mode without edits must not save normalized text. After a rich edit, normal Markdown escaping may change source spelling while preserving visible HTML characters and Markdown meaning. Source edits must import before later rich edits can overwrite them.
- Update `markdown_editor_reliability.real.test.tsx` expectations for rejected HTML insertion and forced recovery. Add focused real-editor coverage for mixed import, round trips, and genuine failure preservation. Run affected tests, app typecheck, and app lint during implementation.

## acceptance criteria

- Pasting the reported stack trace with encoded backticks succeeds once at the caret or replaces the selection. Existing surrounding content and every stack-trace entry remain; no Source switch or retry/error dialog occurs.
- Both `text/plain` and `text/markdown` paste preserve HTML tags and comments as visible text while formatting supported Markdown outside HTML nodes. Cover inline and multiline block HTML, including nested list/quote contexts.
- Opening or externally replacing a document containing HTML succeeds in Rich text, including compact and read-only editors. Opening leaves source unchanged and document clean; no forced switch or HTML error occurs.
- After insertion or a Source edit, returning to Rich text, making an unrelated edit, saving, and reopening preserves inserted content and formatting. HTML characters cannot disappear or become rendered elements.
- Draft insertion requests succeed once and update their owning draft. Images and attachments still insert supported Markdown without changing mode.
- Explicit Source controls, initial Source mode, Ctrl+Shift+V, and existing undo/redo behavior remain usable. Viewing Source without edits preserves rich history; Source edits establish the existing new rich-history baseline.
- A genuine insertion/conversion failure preserves complete prior document and source, reports its cause, and never selects Source automatically. Manual Source selection remains available for recovery.
