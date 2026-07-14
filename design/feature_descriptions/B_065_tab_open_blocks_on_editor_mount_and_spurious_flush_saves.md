---
id: B-065
title: opening a tree item blocks on editor mount and tab switches trigger spurious flush-saves
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Clicking a file in the list-view tree takes noticeably long (a recorded DevTools profile showed a ~1500 ms click task). Profiling the real `TextView` with the real `design/` files isolated two separate defects.

### 1. Tab switches flush a body that was never edited

`MarkdownEditor` initializes `latestMarkdownRef` and `lastEmittedMarkdownRef` from the raw file body, but MDXEditor/Lexical fires `onChange` during initialization with its own *normalized* serialization (trailing whitespace stripped, escaping and final-newline differences). From that moment the editor considers the document changed. On unmount (every tab switch, window blur, app close) `flush()` emits the normalized body even though the user typed nothing.

That flush runs `updateCardBody` → `CardOperations.saveFile`, which has **no unchanged-content check**: it replaces the file list, rebuilds the whole project snapshot, dispatches a change event (full workspace re-render), and schedules a git commit. With `pushMode: auto` this even pushes. Verified in the wild: commit `04425fd` ("Update design/actions/fix bug.md") is a whitespace-only diff produced just by opening and closing that file.

Cost per tab switch: an extra snapshot rebuild + full re-render inside the click, plus git/history noise and file churn on disk.

### 2. The editor mounts synchronously inside the click

`TextView` keys `MarkdownEditor` by `activeCard.path`, so every tab open *and every switch between already-open tabs* mounts a fresh MDXEditor synchronously in the click task. Measured in the running dev app (StrictMode):

- real design-folder documents: 100–240 ms per click
- cost scales with content; fenced code blocks dominate because each one instantiates its own CodeMirror editor (~15 ms each, superlinear: 60 blocks ≈ 900 ms); tables ≈ 12 ms each
- `ActionEditor` mounts in 5–15 ms and is not a problem

Dev mode + StrictMode double-mounting + React DevTools/profiling overhead multiplies this to the observed ~1500 ms. Production is faster but still visibly laggy for large documents, and defect 1 stacks a snapshot rebuild on top of the same click.

## Fix

We implement fixes 1 and 2. We do **not** keep inactive tab editors mounted (option 3 from the analysis was rejected).

### Fix 1 — baseline the normalized markdown and short-circuit no-op saves

In `app/src/components/editor/markdown_editor.tsx`:

- After mount, capture the editor's own normalized serialization as the flush baseline: in a mount effect, read `editorRef.current.getMarkdown()` and assign it to **both** `latestMarkdownRef.current` and `lastEmittedMarkdownRef.current`. Do not rely on "the first `onChange` is the init one" — a fast user edit could race it; `getMarkdown()` in the mount effect is deterministic.
- The effect must be idempotent (StrictMode runs it twice) and must run before the flush-registration effect's cleanup can fire, i.e. keep it in the same component ahead of (or merged with) the existing `registerMarkdownEditorFlush` effect.
- `flush()` semantics stay unchanged: emit only when `latestMarkdownRef` differs from `lastEmittedMarkdownRef`. With the baseline set, an untouched document never emits; a real edit still flushes (and saves the normalized form, as today).
- The imperative `setMarkdown` handle already resets both refs; leave as is.

In `app/src/services/card_operations.ts`:

- Add an unchanged-content guard as defense in depth where all card writes funnel: in `saveFile`, look up the current file for `file.path` and return early (no `replaceFiles`, no commit scheduling, no `dispatchChanged`) when the new content is byte-identical. This also protects the title/header/affects update paths.

### Fix 2 — take the editor mount out of the click task

In `app/src/components/text_view/text_view.tsx`:

- Keep the tab bar, tree selection highlight, and pane chrome driven directly by `activePath` so the click commits instantly.
- Defer only the heavy editor: mount `MarkdownEditor` for `activePath` one paint later. Preferred mechanism: a `mountedEditorPath` state synchronized in an effect (`useEffect(() => setMountedEditorPath(activePath), [activePath])`), rendering a lightweight placeholder (empty pane or minimal skeleton, no spinner flash for fast mounts) while `mountedEditorPath !== activePath`. `useDeferredValue(activePath)` is an acceptable alternative, but it keeps showing the *previous* document under the new active tab during the transition, which reads as a wrong-content flash; the placeholder variant is preferred.
- The unmount flush of the previous editor must keep working: the previous `MarkdownEditor` unmounts when the keyed element for the old path is replaced, exactly as today — only one editor is ever mounted.
- `ActionEditor` does not need deferral (5–15 ms mount).

## Edge cases

- Rapid tab switching: each unmount flush must target its own path; a deferred mount cancelled by a newer click must not mount the stale editor.
- Opening a file and closing its tab before the deferred editor mounts.
- Window blur / app quit between click and deferred mount (`flushMarkdownEditors` must not throw on the not-yet-mounted editor).
- StrictMode double mount/effect cycles must not emit a flush or double-set the baseline.
- External file change reloading the snapshot while a tab is open (existing `key={path}` behavior unchanged).
- A document whose raw content already equals the normalized serialization (baseline equals prop; still no emission).

## acceptance criteria

- Opening and closing / switching tabs on an untouched file never calls `onBodyChange`, never rewrites the file, and never creates a git commit.
- `saveFile` with byte-identical content performs no snapshot rebuild, no change dispatch, and schedules no commit.
- A real edit still flushes on tab switch, window blur, and app close, and persists.
- Clicking a tree item commits the tab/selection UI without waiting for the editor mount; the editor content appears in a follow-up frame.
- Regression tests cover: untouched open/close produces no save; edit-then-switch produces exactly one save; rapid A→B→A switching mounts only the final editor and loses no flush.
