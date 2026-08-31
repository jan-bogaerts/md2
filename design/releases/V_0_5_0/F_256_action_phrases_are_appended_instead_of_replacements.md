---
author: 
id: F_256
internalId: cd9535f0-5c2f-4544-a485-c37091c9b3f0
title: action phrases are appended instead of replacements
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__cd9535f0-5c2f-4544-a485-c37091c9b3f0.json
policy:
after: 7f35084a-0348-4869-a764-e0ff2ff2843d
changedFiles:
  - app/src/components/actions/editor/action_phrase_buttons.tsx
  - app/src/components/actions/editor/action_phrase_buttons_owner.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
---

when a user clicks on a predefined phrase to use in a prompt for an action, the input prompt is completely replaced with the phrase. this way, the user can not first type something.

better is to append the phrase, from the current cursor position. if there is no cursor position, a full replace is still allowed

## Current state

`ActionPhraseButtonsOwner.handleSelect` gets current action prompt draft and calls `replace(text)`. This external replacement resets mounted Markdown editor to phrase text, so earlier user input is lost. Double-click uses same selection path before submitting prompt.

Prompt draft already exposes `requestInsertion(markdown)`. Mounted `MarkdownEditor` handles request through `MarkdownDraft`, inserts at current caret, and updates same service-owned draft. Here, **caret** means collapsed text selection: single point where typed text appears. If editor has no saved selection, existing editor behavior inserts at document end. Existing Markdown editor tests cover caret insertion, selected-text replacement, and document-end fallback; popup phrase tests currently assert full replacement.

## implementation details

* Change phrase selection to request insertion of phrase text through current `ActionPromptDraft`; do not build prompt string in React or add separate cursor state.
* Insert phrase text verbatim. Do not add spaces or line breaks. At a caret, phrase goes before text after caret. For selected text, existing Markdown editor insertion replaces selection.
* Keep document-end insertion when no saved selection exists. Full replacement remains allowed by requirement but is unnecessary while mounted editor can handle insertion; report genuine insertion failures through `dialogService`.
* Clear existing conversion message after successful phrase insertion, as current selection does.
* Preserve double-click submit behavior without inserting phrase more than once. First click inserts phrase; second click from same double-click sequence must not insert again; submit waits for insertion and editor flush before reading draft.
* Update focused phrase/popup tests for empty prompt, insertion into middle of typed prompt, document-end fallback, selected text, one-time double-click insertion and submission, and insertion failure. Use realistic click/double-click event sequence where event order matters.
* Keep phrase visibility, approval gating, prompt preparation, Send rules, run continuation, successful-send clearing, and action definitions unchanged.

## acceptance criteria

* Clicking predefined phrase in non-empty prompt preserves existing text and inserts phrase exactly at current caret.
* Clicking phrase with selected prompt text replaces only selection, using existing editor insertion behavior.
* Clicking phrase when editor has no saved selection inserts phrase at document end; existing text is not discarded.
* Clicking phrase in empty prompt produces phrase text.
* Phrase text gains no implicit whitespace or line breaks.
* Double-click inserts phrase once, then submits complete resulting prompt once. Submission waits until inserted text is present in draft.
* Insertion failure shows existing predefined-phrase error path and does not silently discard typed prompt.
* Phrase visibility, approval gating, continuation behavior, prompt clearing after successful send, and manual Send behavior remain unchanged.
