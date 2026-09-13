---
author: 
id: F_348
internalId: 7587f168-1106-4f87-b705-a38eab8717f4
title: add local search to action popup
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__7587f168-1106-4f87-b705-a38eab8717f4.json
policy:
after: 8b9b629c-e109-4dad-9092-6c2b588481e8
---

We recently added local search to cards. this seems to work.

see [F\_104\_add\_local\_text\_search\_md\_editor.md](design/releases/0_3_0/F_104_add_local_text_search_md_editor.md), but also see [B\_229\_position\_of\_local\_search.md](design/feature_descriptions/B_229_position_of_local_search.md)

we should now add a local search box to the action popup. it should search in the conversation log that is currently selected. nothing more.

## Current state

`ActionPopupFrame` keeps its toolbar, conversation picker, and action selector above the scrolling popup body. `ActionConversationStore` selects one live or persisted conversation, using `AgentConversation.id` as conversation identity, and `ActionConversationTranscript` renders that conversation inside its own `Conversation chat` scroll viewport.

The action popup has no search control or transcript-search state. `ActionConversationTranscript` renders messages as Markdown and renders supported agent events through expandable groups and detail sections. Hidden events and collapsed details are absent from rendered text. The action-prompt `MarkdownEditor` already sets `localTextSearch={false}`, so `Ctrl+F` is left for popup-level conversation search; currently the browser handles it instead.

## Implementation details

* Define **conversation-local search** as matching visible plain text inside the currently rendered `ActionConversationTranscript`. Exclude action prompt, conversation metadata, popup controls, other conversations, filtered events, and collapsed detail content. Expanded detail becomes searchable because it is then visible.
* Add a popup-scoped `EventTarget` search service beside action-conversation components. Create it with the other selected-action bindings, register the mounted transcript viewport and current `AgentConversation.id`, and expose stable primitive snapshots for `useSyncExternalStore`. Service owns open state, draft and submitted terms, case mode, result count, active match, and DOM selection; React components only subscribe and render.
* Add a tooltip-backed `Find in conversation` icon button to `ActionPopupFrame`. Disable it while no conversation transcript is mounted. Opening it shows an auto-focused search row below the action selector, inside the fixed popup header, so it remains visible while conversation scrolls and stays within desktop, full-height, and mobile popup bounds.
* Keep controls consistent with Markdown local search: search field, Search button, result count, Previous result, Next result, and Match case toggle. Default to case-insensitive. Enter submits; `F3` selects next result; Escape closes only search row.
* Handle `Ctrl+F` from focused popup content, prevent browser find, and open conversation search. Action-prompt editor remains opted out, so its bubbled shortcut reaches popup handler. Do not intercept shortcuts from a different popup.
* When search opens, use non-empty browser-selected text only when entire selection lies inside transcript; otherwise retain popup-local draft term. First search starts at selection end when valid, or transcript start. Previous and next navigation wrap once at transcript boundaries.
* Build ordered search text from visible DOM text nodes in transcript viewport and map flattened offsets back to a DOM `Range`. Select and scroll active range into nearest view without changing conversation data or expanding collapsed groups. Empty terms and missing matches do not change current selection.
* Recompute matches after visible transcript content changes during streaming. When selected `AgentConversation.id` changes, discard old active range and search new transcript from its start with submitted term, if any. This prevents a result from previous conversation remaining selected.
* Keep conversation selection, acknowledgement, auto-scroll, rendering, expansion, prompt editing, action execution, persistence, and desktop backend unchanged. Add focused pure search/service tests plus popup and transcript integration coverage for shortcuts, scope, selection mapping, wrapping, case mode, streaming updates, conversation changes, collapsed content, scrolling, and empty/no-match behavior.

## Acceptance criteria

* When selected conversation is rendered, action popup shows enabled `Find in conversation` button. With no rendered conversation, button is disabled.
* Button or `Ctrl+F` opens focused search row below action selector and prevents browser find. Search row stays visible while transcript scrolls and remains inside desktop, full-height, and mobile popup.
* Search matches only visible plain text in currently selected conversation transcript. Prompt, metadata, popup controls, other conversations, hidden events, and collapsed details never match.
* Non-empty selection wholly inside transcript seeds search and sets first-search origin. Selection outside transcript does not seed it.
* Search defaults to case-insensitive. Match case toggle, result count, Search, Enter, Previous result, Next result, `F3`, wrapping, and Escape work accessibly.
* Match spanning adjacent rendered text nodes is selected and scrolled into view. Empty term or no match causes no error and leaves selection unchanged.
* Streaming visible content updates result set without forcing transcript to end. Selecting another conversation removes old range and searches only new `AgentConversation.id`.
* Searching never edits conversation or prompt data, changes expansion state, acknowledges a conversation, starts an action, writes persistence, or calls desktop backend.
* Focused search, action-popup, and conversation-transcript tests pass; existing Markdown local-search and action-prompt opt-out tests remain passing.
