# Testing Markdown editing reliability

This change adds Source controls to the shared document editor, preserves hard breaks, and imports reference links and images. Compact new-card and agent prompt editors retain their compact layout and expose Source for conversion recovery. Literal command fields and historical diff views retain their existing behavior.

## Start the test checkout

The implementation is on `feat/markdown-editing-reliability`. Open two terminals in the prepared worktree, or in your own checkout of the PR branch.

Start its frontend on a dedicated port:

```sh
npm run dev --prefix app -- --host 127.0.0.1 --port 5184 --strictPort
```

Start Electron against that frontend in the second terminal:

```sh
MD2_APP_URL=http://127.0.0.1:5184 npm start --prefix desktop
```

On Windows PowerShell, set `$env:MD2_APP_URL = 'http://127.0.0.1:5184'`, then run `npm start --prefix desktop` separately. Fresh contributor checkouts need the normal root, app, and desktop dependencies installed first. The prepared local checkout already has them available.

## Owner checks

1. Open a card in list view and in its board popup. Switch between **Rich text** and **Source** without editing; the document must remain clean and its saved source unchanged. Repeat for an instruction and an action's Markdown prompt/phrases.
2. Paste the fixture below into Source. Return to Rich text, make an unrelated edit, save, close, and reopen. Both links must resolve, the explicit break must remain a break, and the unused definition must remain in Source.
3. Edit one link's destination using its existing dialog. That occurrence may become an inline link; the other reference and its definition must keep their original destination. Copy a reference in Rich text and paste it into another Markdown document; its definition must travel with it.
4. In Source, type, undo, redo, paste, and attach/drop a file at a chosen caret position. Confirm these operations affect the visible Source editor. Source undo is local to that Source session. Returning to Rich text after Source edits starts a new rich undo baseline; old content must not return on undo.
5. Switch between two cards while in Source. Text and undo must belong to the selected card, and identical reference labels in different cards must retain each card's destination.
6. Try `<!-- preserved comment -->` or `<div>preserved HTML</div>`. The editor must recover in Source with the original text intact. Replace it with ordinary Markdown, then return to Rich text. Also check a read-only search preview and a compact new-card or agent prompt editor. Pasting unsupported content into Rich text must preserve the existing document and open Source; paste again there to insert the raw content.
7. Check the controls in light and dark themes, plus a literal command field containing backslashes and Markdown punctuation.

```markdown
# Editing fixture

Hard break here\
continues here.

Soft newline here
continues here.

[First][doc] and [doc][]

[doc]: https://example.com "Shared destination"
[unused]: https://unused.example "Keep this definition"
```

Rich edits can normalize ordinary Markdown spelling and move definitions to the end of the document while retaining their meaning. Source saves retain the typed text. This PR does not add footnotes, Mermaid, math, or repository-relative image loading.

## Automated checks

Use the targeted real-editor, editor UI, document binding, draft, and history tests. The editor regressions run against installed MDXEditor/Lexical/CodeMirror rather than the textarea test adapter. Parser error reporting is checked through actual recovery; the adapter now disables native Lexical events to avoid dispatching clipboard commands twice, and local-search tests run independently so their MUI mock loads first.

On Node versions exposing experimental Web Storage, run tests with `NODE_OPTIONS=--no-experimental-webstorage`. Run `npm run lint`, `npm run typecheck`, and `npm run build` from `app/`. The browser smoke check covers a composed document with references, breaks, tasks, a table, and a code fence, including Source typing, undo/redo, insertion, and return to Rich text.
