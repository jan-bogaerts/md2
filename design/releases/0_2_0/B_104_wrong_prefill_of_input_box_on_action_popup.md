---
author: 
id: B_104
internalId: 51db4329-b855-4084-9e87-a50d3ce8eb6e
title: wrong prefill of input box on action popup
status: ready
owner: 
affects:
agents:
  - design/releases/0_2_0/card__51db4329-b855-4084-9e87-a50d3ce8eb6e.json
policy:
after: 3913c1ee-9bd7-40df-bfae-1f0188881b8f
---

We already looked at this in the card `design/releases/0_1_0/B_97_when_action_completes_dont_autofill_the_input_again.md` but apparently this was not yet fixed correctly.

* a prefilled message should only be shown for a new empty conversation.
* when the user selects an existing conversation or when the popup automatically goes to the first non-read conversation of an action, the input should not be prefilled.

basically, the rule is simple: is there something in the chatlog history? then don't prefill the input

# Current state

Before this fix, selecting a stored conversation clears the prompt draft. `ActionAgentPromptOwner` then treats a completed selected conversation as eligible for prompt preparation, so the stored action prompt refills the input. The same sequence occurs when the popup automatically selects the newest unseen conversation. An unseen conversation has `viewed: false`; newest means greatest `startedAt`. An existing conversation means any selected persisted conversation, even when its `entries` array is empty.

# Implementation details

- Prepare the stored action prompt only when no agent session is active, the run is not completed, and no conversation is selected.
- Keep the prompt empty after manual or automatic selection of any existing conversation, regardless of conversation status or entry count.
- Preserve stored-prompt prefill for a new empty conversation. A new empty conversation means the popup has no selected persisted conversation and no active agent session.

# Acceptance criteria

- Opening an agent action with no selected conversation and no active session prefills the input with the stored action prompt.
- Selecting any existing conversation clears the input and does not prepare or apply another stored prompt.
- Automatically selecting the newest unseen conversation leaves the input empty and does not prepare or apply another stored prompt.
- Completing an active conversation leaves the input empty, as specified by `B_97_when_action_completes_dont_autofill_the_input_again.md`.
- Popup tests cover new-conversation prefill, manual historical selection, automatic unseen-conversation selection, and completion.
