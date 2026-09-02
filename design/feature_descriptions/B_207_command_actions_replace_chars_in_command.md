---
author: 
id: B_207
internalId: 711befe5-b3f9-400b-b077-2b44830c9e38
title: command actions replace chars in command
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__711befe5-b3f9-400b-b077-2b44830c9e38.json
policy:
after: 3f00b054-71c0-4d3f-abd5-0148f716b536
branch: b_207_command_actions_replace_chars_in_command
worktree: 1
---
it appears we are replacing characters that we entered in the command line of a command action. apart from replacing placeholders, we should not be doing this. so:

* why are we doing this
* where is it occuring
* are there other things done to the command line?

ex: input: `powershell.exe -NoProfile -File "C:\Users\janbo\Documents\dev\vidsy\tools\release_electron.ps1"`
actually executed: `powershell.exe -NoProfile -File "C:\Users\janbo\Documents\dev\vidsy\tools\release\_electron.ps1"`&#x20;

## Current state

**Where the command text comes from.** A command action stores its command line in its action JSON file. The action editor edits that field in a plain MUI text field (`app/src/components/actions/editor/action_definition_fields.tsx:311`), so the stored JSON is never mangled. The action *run popup* is a different editor: for `action.type === 'command'` it seeds a prompt draft with `action.command` (`app/src/components/actions/run/popup/action_popup_operations.ts:83`) and renders that draft in the shared `MarkdownEditor` (`action_prompt_owner.tsx` → `action_agent_prompt.tsx:302`), which wraps MDXEditor 4.

**Why characters change.** MDXEditor holds the document as a Lexical node tree, not as text. Its `onChange` hands back a *re-serialized markdown source string* — the tree rendered back to markdown by `mdast-util-to-markdown`. That serializer escapes any character that could start a markdown construct, so it emits `\_` for `_`, `\*` for `*`, `\[` for `[`, rewrites a leading `- ` bullet to `* `, and drops leading indentation. The escapes are *source syntax*: the editor still displays, and still copies as text, the original `release_electron.ps1`. Only the markdown source string carries the backslashes — which is exactly why copy-as-text looks correct while the run is wrong. Verified against the repo's own `mdast-util-to-markdown`: `powershell.exe -NoProfile -File "…\tools\release_electron.ps1"` serializes to `…\tools\release\_electron.ps1`.

**Causal chain, in order.**

1. Popup opens; draft is seeded with the clean `action.command`.
2. `MarkdownEditor.handleEditorChange` (`markdown_editor.tsx:302`) receives the **serialized markdown**, not the visible text, and stores it into the draft via `activeDraftRef.current?.edit(markdown)`. From this point the draft snapshot holds escaped source.
3. Run is triggered. `runWithPrompt` sends the draft snapshot as `{ command: prompt }` (`action_popup_operations.ts:134`).
4. Main process: `action_run.js:329` and `:537` prefer `this.runInput.command` over `action.command` for the **root** action, so the escaped string wins.
5. `executeCommandAction` resolves placeholders and spawns it with `shell: true` (`desktop/src/actions/action/action_command_executor.js`). PowerShell then fails on the non-existent path `release\_electron.ps1`.

**Scope.** Only popup-launched *root* command actions are affected. Chained actions (`onBefore` / `on` / `onAfter`, i.e. `isRoot === false`) read `action.command` straight from JSON and are correct. Agent actions are unaffected — a prompt *is* markdown, so escaping there is harmless.

**Other things done to the command line.** Besides the escaping bug: placeholder substitution via `resolvePlaceholders` (intended, `desktop/src/actions/action/action_text.js`); an empty-command guard on the trimmed string (`action_run.js:330`); a forced working directory of the project git root plus an `assertGitRoot` check; and, when `showCommandWindow` is set, the command is written verbatim into a temporary `command.cmd` (`<command>\r\nexit /b %errorlevel%`) and launched through `start "" /wait cmd.exe /d /s /c call "<file>"`. That wrapper does not rewrite the command text, but it does change `%VAR%` / `!VAR!` expansion semantics relative to the inline runner — out of scope here, noted so it is not mistaken for a second escaping bug.

## Implementation details

Keep the markdown editor in the command popup — the placeholder typeahead menu and local search depend on it. Fix the extraction instead: for command actions the editor must exchange **plain text**, in both directions, never markdown source.

1. **Plain-text mode on `MarkdownEditor`** (`app/src/components/editor/markdown_editor.tsx`). Add a `plainText?: boolean` prop.
   * *Read:* when set, `handleEditorChange` must not forward MDXEditor's serialized markdown. It forwards the Lexical root's text content instead (`$getRoot().getTextContent()`), obtained through a small realm plugin that captures the root editor (same pattern as the existing `plain_markdown_realm_plugin.ts` / `markdown_placeholder_realm_plugin.ts`). Normalize the block separator: Lexical joins top-level blocks with `\n\n`, so collapse consecutive blank separators to a single `\n` — a command line typed with Enter must not gain a blank line.
   * *Write:* `replaceMarkdown` / `setMarkdown` must not parse the incoming string as markdown either, otherwise loading a stored command like `echo *a*` renders as italics and loses the asterisks on the way back out. In plain-text mode, set the content by building text nodes directly (splitting on `\n` into line breaks) rather than calling MDXEditor's `setMarkdown`.
   * Disable `markdownShortcutPlugin` in plain-text mode so typing `# ` or `- ` at the start of a line does not silently become a heading or bullet.
   * `getMarkdown()` on the handle keeps returning whatever the current mode produced, so `flush` and the dirty-tracking refs need no special casing.
2. **Turn the mode on for command actions.** `action_agent_prompt.tsx` already receives `monospace={action.type === 'command'}` from `action_prompt_owner.tsx` — pass the same condition through as a new `plainText` prop and hand it to `MarkdownEditor`. Do not change the agent path.
3. **No main-process change.** `action_run.js` and `action_command_executor.js` stay as they are; once the draft holds plain text, `runInput.command` is already correct. Placeholder resolution stays the only intentional substitution.
4. **Existing corrupted drafts.** Prompt drafts are keyed per action/context/run and re-seeded from `action.command` on `resetSubmittedDraft`; no persisted migration is needed. If a stale escaped draft is in memory when the fix ships, reopening the popup reseeds it.

## Acceptance criteria

1. A command action whose command line is `powershell.exe -NoProfile -File "C:\…\tools\release_electron.ps1"`, run from the popup without editing, executes that exact string — the run history entry and the spawned command both show `release_electron.ps1`, with no backslash before the underscore.
2. The same holds after the user edits the command in the popup: typing a character anywhere in the field does not introduce escapes elsewhere in the line.
3. Characters that are markdown-significant survive a full popup round trip (open → edit → run) unchanged: `_`, `*`, `[`, `]`, `` ` ``, `#`, `~`, and a leading `-`. Specifically, a command starting with `- ` is not rewritten to `* `, and leading whitespace is preserved.
4. A multi-line command entered with Enter arrives at the runner with single `\n` separators, not `\n\n`.
5. `{{placeholder}}` insertion still works in the command popup: the typeahead menu opens, inserts a placeholder, and the placeholder is resolved by `resolvePlaceholders` at run time. Local text search in the field still works.
6. Agent actions are unchanged: prompts continue to round trip as markdown, and markdown shortcuts (heading, list) still apply in agent prompt editors.
7. Chained command actions (`onBefore` / `on` / `onAfter`) continue to run `action.command` from JSON verbatim.
8. Tests: a unit test asserting the command popup draft snapshot equals the typed text for a command containing `_` and `*`; a test asserting a leading `- ` is not converted; an existing-behaviour test that an agent prompt still serializes as markdown. `npm run typecheck` passes.