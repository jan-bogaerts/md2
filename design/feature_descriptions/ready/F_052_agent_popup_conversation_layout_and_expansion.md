---
id: F-052
title: agent popup conversation layout, history picker and full-height mode
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Make the agent popup read like a chat: show the selected conversation above the prompt, replace the inline agent run-history list with a conversation picker, and allow the popup to expand to the full application height.

## Current state

`ActionPopup` is shared by the card `Run` entry point and the project agent FAB. In its card-run layout, `ActionAgentForm` renders the Agent, Model and Thinking selectors followed immediately by the prompt. `ActionRunStatus` is rendered below the form and shows phase summaries rather than the persisted conversation messages. `ActionRunHistory` then renders every action-history entry inline.

Action history is keyed by action id and context and stores output summaries; an entry has no conversation reference and therefore cannot load a chat. Persisted `AgentConversation` records already contain `startedAt`, `title`, `messages` and `path`, but card conversations are discovered through the card's `agents` frontmatter and project-scoped conversations have no equivalent listing contract. The parser also replaces a missing conversation title with its id, so the UI cannot currently distinguish an explicit title from a fallback.

## Implementation details

### Agent popup layout

- Apply the new layout to agent actions in both shared popup entry points: card `Run` and the project agent FAB. Command-action history and its diff controls keep their current behavior.
- Keep Agent, Model and Thinking on one control row. Add a conversation-history dropdown on that row and align it to the right.
- Below the controls, show the selected conversation as an ordered chat log using its user and assistant messages. The active run continues to stream into this area; lifecycle, tool and error events may be shown where relevant without replacing the message transcript with phase summaries.
- Place a divider below the chat log and the prompt input below the divider. Empty/new conversations show an empty chat area without an inline run-history placeholder.
- Starting a new conversation selects its live log. Selecting a persisted conversation loads it by reference and replaces the displayed chat log. If the user continues that conversation, pass the selected conversation `path` through the existing `continueFrom` flow; do not continue a different or merely most-recent conversation.
- Loading failures use `dialogService` and leave the previously selected conversation visible.

### Conversation history dropdown

- Replace `ActionRunHistory` in the agent popup with the dropdown; do not derive the picker from `ActionRunHistoryEntry` summaries.
- Each item represents exactly one persisted `AgentConversation` belonging to the popup context. Card popups include conversations whose `cardPath` matches the card. Project popups include project-scoped conversations whose `cardPath` is `null`. Do not mix conversations from another card or scope.
- Sort conversations newest first by `startedAt` and display the date and local time for every item.
- When the log contains a non-empty explicit `title`, use it as the item text and show the date/time with it. Without an explicit title, use the date/time as the item text. Preserve whether the title was explicit during parsing instead of presenting the current id fallback as a title.
- Add a listing/loading boundary that works for local Git, GitHub and remote-control storage. Card frontmatter references can remain the card discovery source; project scope needs an explicit way to discover its conversation references. Keep path validation and the existing `cardPath` ownership check.
- Refresh the picker after a run is persisted. A running conversation may appear immediately, but it must not be duplicated when the persisted record arrives.

### Full-height mode

- Add an `Expand upward` icon button immediately before the existing Close button in the popup header.
- Expanding detaches the popup's positioning from its FAB or card `Run` anchor while retaining the selected action and context. Position its top and bottom edges at the application viewport edges so it occupies the full application height; preserve its current width and horizontal position within the viewport.
- In full-height mode, replace the expand button with a `Collapse downward` button. Height resize handles are inactive while expanded.
- Collapsing reattaches the popup to its original anchor and restores the exact pre-expansion size and placement. Full-height dimensions must not overwrite the separately persisted normal sizes for card and project-agent popups.
- Closing from full-height mode closes normally. Reopening starts in normal anchored mode. Resizing the application while expanded keeps the popup constrained to the application height.

## Affected components

- `app/src/components/actions/action_popup.tsx`: header controls, agent-only layout, selected chat and expanded state.
- `app/src/components/actions/action_agent_form.tsx`: separate the selector row and prompt so the chat and divider can sit between them without duplicating form behavior.
- `app/src/components/actions/use_action_popup_controller.ts`: conversation selection/loading, refresh and continuation reference.
- `app/src/components/actions/action_run_history.tsx`: remains for command actions; it is no longer rendered for agent actions.
- `app/src/components/resizable_popper.tsx`: support a controlled full-height detached presentation while preserving normal anchored size.
- Agent conversation types, parsers and storage/bridge implementations: retain explicit-title information and list conversations for the requested context.

## Edge cases

- An empty history leaves the dropdown empty/disabled and still allows a new run.
- Invalid dates fall back to the stored timestamp text rather than hiding the conversation.
- Switching actions reloads and selects history for the new action/context; a late response from the previous selection must not replace it.
- A selected failed or cancelled conversation remains readable. Continuation availability follows the existing provider/session rules.
- Expanding a card-linked popup changes only presentation; it does not lose or broaden the card context.

## Acceptance criteria

- In an agent popup, the selected/live chat is above the prompt and a divider separates them.
- Agent, Model and Thinking remain on one row, with a right-aligned conversation dropdown.
- Every dropdown item shows local date and time; an explicit log title is used as its label when present.
- Selecting an item loads that single conversation into the chat, and continuing uses that conversation's reference.
- Card and project popups show only conversations owned by their context and refresh without duplicates after a run.
- Agent popups no longer show the inline `ActionRunHistory`; command history and diff behavior are unchanged.
- The header shows Expand immediately before Close. Expand fills the application height and detaches from the anchor; Collapse restores the original anchored size and placement.
- Tests cover layout order, divider placement, title/date fallback labels, sorting, context filtering, selection races and errors, continuation reference, history refresh, expand/collapse restoration, viewport resizing, and both card and FAB entry points.
- App and desktop lint, typecheck and tests pass.

## See also

- `design/architecture/initial description/action_popup.md`
- `design/feature_descriptions/F_049_agent_chat_fab_popup.md`
- `design/feature_descriptions/ready/F_047_running_actions_and_agents.md`
- `design/feature_descriptions/ready/F_050_one_shot_agent_conversations.md`
- `design/feature_descriptions/ready/F_033_agent_and_model_selection.md`
