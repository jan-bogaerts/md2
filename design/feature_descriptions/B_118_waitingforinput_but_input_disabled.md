---
author: 
id: B_118
internalId: 8355401d-f3b6-4285-a21d-8ec6ed389215
title: waitingForInput but input disabled
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__8355401d-f3b6-4285-a21d-8ec6ed389215.json#conversation=agent-9e8498b4-e114-4432-93df-29831b587af2
policy:
branch: b_118_waitingforinput_but_input_disabled
worktree: 1
---

on action popup: state is waiting for input, but the input box is disabled, not possible to send input. this is a bad state handling

## Current state

`ActionRunRegistry` exposes `waitingForInput` for free-text follow-up, structured agent questions, and command approvals. `interactionReady` means live desktop agent process has an open channel that can accept another prompt.

`ActionAgentPrompt` makes Markdown editor read-only when prompt preparation is not `ready` or its `disabled` prop is true. Its only caller, `ActionAgentPromptOwner`, currently passes `disabled={false}`. Current source therefore does not intentionally disable prepared editor while waiting, but this invariant is implicit and has no focused regression test for manual typing after transition to `waitingForInput`.

Send button has separate rules in `actionPopupRunDisabled`: live agent must be interaction-ready, prompt must contain text, and no question or approval may be pending. A persisted waiting conversation without live process instead starts continuation run from stored conversation path. Existing tests cover button visibility, phrase insertion, sending, and persisted continuation, but not reported disabled-editor state directly.

## implementation details

* Make prompt editability independent from active-run status. Remove unused `disabled` prop from `ActionAgentPrompt`; keep editor read-only only while prompt draft preparation is loading or failed.
* Do not use `queued`, `running`, or `waitingForInput` alone as editor-disable condition. Keep current send gates: backend available, prompt prepared, non-empty text, live interaction channel ready, and no unresolved question or approval.
* Keep structured questions and approvals in dedicated controls. User may type draft while either is pending, but Send remains disabled until pending interaction resolves; draft content must remain intact.
* Keep persisted waiting-conversation behavior: editable prompt sends by starting continuation from selected conversation. Do not require stale live run or `interactionReady` value.
* Add focused popup tests for manual typing and Send after live run changes from `running` to `waitingForInput`; persisted waiting conversation after reload; question and approval gates; prompt preparation; and draft retention. Command actions and conversation history selection remain unchanged.

## acceptance criteria

* When live agent enters `waitingForInput` with ready interaction channel, prompt accepts keyboard input and non-empty prompt enables Send.
* Sending follow-up uses same live run and clears draft only after successful send. Failed send retains draft and reports error.
* Empty prompt, unavailable backend, unresolved question, unresolved approval, or unready interaction channel keeps Send disabled without disabling prepared editor.
* Resolving last question or approval enables Send when draft already contains text.
* After app reload, selecting persisted `waitingForInput` conversation allows typing; Send starts continuation from that conversation.
* Prompt stays read-only during initial prompt preparation and becomes editable when preparation reaches `ready`.
* Existing queued, running, completed, failed, cancelled, Finish, Stop, Schedule, command-action, and conversation-history behavior remains unchanged.
