---
author: 
id: F_406
internalId: 64933355-a3df-4476-b05f-c82b0c81b02a
title: Add copy btn to codeblocks
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__64933355-a3df-4476-b05f-c82b0c81b02a.json
policy:
after: 86f8b326-7ca2-40c8-bcbf-3b596f3efa1e
---

In the chatlogs on the action popup, we have code block elements in the text log items (markdown).

When the mouse is over them, we should show a copy icon. When pressed, copy content of code block

## Current state

* `app/src/components/actions/conversation/messages/action_conversation_message.tsx` renders user and assistant message Markdown with `ReactMarkdown` and `remark-gfm`. Its component overrides handle links only; fenced and indented code blocks use ordinary `<pre><code>` elements. Inline code means code inside a paragraph, without a `<pre>` block.
* Code blocks already retain whitespace, wrap long lines, and use configured Markdown typography plus theme colors. Historical and streaming messages share this renderer. Streaming means message content can still grow while an agent runs.
* `action_conversation_message_commands.tsx` offers Copy message, which copies the entire source Markdown. `action_conversation_copy_button.tsx` already provides an accessible copy icon and reports failures through `dialogService`. No code-block copy control exists.
* `app/src/services/clipboard_text.ts` owns clipboard writing, including the existing fallback for remote-control pages served over plain HTTP. Its tests cover unavailable or rejected Clipboard API writes and fallback failures.

## implementation details

* Add `action_conversation_code_block.tsx` beside the message renderer. Register it as the `pre` override in `MARKDOWN_COMPONENTS`, retaining the existing link override. The component owns code-block layout and copy-text extraction; keep `<pre><code>` semantics and language classes. Place the copy button beside the `<pre>` inside a positioned wrapper, rather than inside code text.
* Reuse `ActionConversationCopyButton` with tooltip and `aria-label` set to `Copy code block`. Supply only the parsed code element's text: no Markdown fences, language label, surrounding prose, or control text. Preserve spaces, tabs, blank lines, and the trailing newline produced by the Markdown renderer; do not trim. Derive text from current render input so a streaming update changes the next copied value. Empty blocks copy an empty string if that is their rendered text.
* Place the icon at the block's upper-right corner. Keep it mounted but transparent at rest; show it when that block is hovered or contains keyboard focus. On devices without hover, keep it visible. Reserve space so the icon never covers code and revealing it does not move content. Keep keyboard activation, text selection, wrapping, and theme styling intact. Follow `design/STYLE_GUIDE.md` and `design/architecture/architectural_decisions.md`.
* Keep existing shared behavior. `ActionConversationCopyButton` callers are `ActionConversationMessageCommands` and `ActionConversationEventRow`; both retain their labels, source payloads, and error handling. `copyTextToClipboard` callers are that shared copy button, `CardPathMenuItems`, and `RemoteControlConnectionInfo`; all retain current clipboard behavior. Neither shared helper needs modification. Copying requires no conversation mutation, persistence change, new application state, or Electron bridge.
* Add component tests with mocked clipboard boundaries for multiple blocks, fenced blocks with and without language labels, indented blocks, whitespace, empty blocks, inline code exclusion, streaming updates, keyboard activation, and error reporting. Add message-renderer integration coverage proving the override is wired in and Copy message still copies source Markdown. Retain existing code-block rendering coverage in `action_conversation_chat.grouped.test.tsx` and copy coverage in `action_conversation_item_commands.test.tsx` and `clipboard_text.test.ts`.
* During implementation, run affected test files independently and `npm run lint` in `app/`. Manually verify hover/focus visibility, devices without hover, narrow messages, long lines, and light/dark themes; DOM tests alone cannot establish these visual interactions.

## acceptance criteria

1. Every fenced or indented code block in an action-popup user or assistant message has its own Copy code block icon. Inline code has no block copy icon. This works for historical messages and messages still streaming.
2. Hovering a block reveals its icon; leaving hides it unless keyboard focus remains within that block. Keyboard users can reach and activate the button. Devices without hover show the icon continuously. Tooltip and accessible name identify the action.
3. Activating an icon copies only that block's rendered code text, preserving whitespace and rendered trailing newline. Multiple blocks copy independently. After a streaming update, the next click copies the updated text. Empty blocks do not throw.
4. Copy failures reach `dialogService` through the existing shared button. Copy remains available while a conversation runs and in read-only projects, because it does not modify project data.
5. Revealing or activating the icon does not shift content or cover code. Existing wrapping, selection, language classes, Markdown typography, and light/dark styling remain usable. Whole-message Copy and event Copy retain their existing payloads and behavior.
