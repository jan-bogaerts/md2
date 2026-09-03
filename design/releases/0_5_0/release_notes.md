---
internalId: d4b16165-9dca-4c45-8d29-9bd620bfd21a
---
# MD2 0.5.0

## New features

* Archive cards directly from the card menu.
* Track files changed by agents on each card.
* Answer agent questions with custom responses or dismiss them.
* View and follow Codex and Claude sub-agent activity.
* Set preferred models and thinking levels for each agent.
* Review approval requests in a more compact layout.
* Copy selected Markdown as plain text with `Ctrl+Shift+C`.
* View account usage immediately after startup and on remote devices.
* Add subscription costs to compare agent costs and value.
* Hide unsupported models from account usage.
* Open running actions directly from the running-agents list.
* Assign a default action to each board column.
* Resize global search results.
* Save project changes with `Ctrl+S`.
* View Claude file-change counts in action conversations.
* Select and focus active cards directly from search results.
* Preview archived and released cards from search results.
* Run multiple actions on the same card at once.
* Edit commands before running them and optionally show an interactive command window.

## Improvements and fixes

* Improved queued prompts with visible, editable, and removable queues.
* Steering prompts now reach running agents without waiting for completion.
* Conversation history remains available while an action is running.
* Prompt input stays available and preserves text when an agent finishes.
* Action phrases insert at the cursor without replacing existing text.
* Fixed queued prompts disappearing when an agent completes.
* Fixed action prompt editing and command action saving.
* New command actions can now be saved before entering a command.
* Fixed card content temporarily disappearing after title changes.
* Fixed link controls appearing behind the new-card window.
* Fixed file-reference results moving and resizing while typing.
* Fixed new-card cancellation disrupting editor input.
* Improved action chat speed, stability, scrolling, and layout.
* Failed tool calls are now grouped with a clear error count.
* Token and file-change totals now appear below the conversation.
* Improved action and card labels, tooltips, and popup positioning.
* Improved agent selection persistence and validation.
* Improved statistics with clearer charts, comparisons, costs, and colors.
* Improved project loading speed and protected pending card changes.
* Improved handling of external file changes and project refreshes.
* Improved Claude usage detection and error reporting.
* Fixed statistics in remotely connected browsers.
* Fixed editor history switching errors.
* Fixed linked-worktree and missing-folder errors.
* Fixed release checks being blocked by unrelated cards.
* Fixed remote browsers opening the wrong project.
* Fixed issues when starting a second app instance.
* Recent projects now require confirmation before opening.
* The project folder option is selected by default in the desktop app.
* Global search now shows the correct shortcut for the current platform.
* Improved Windows installation compatibility.
* Improved overall statistics, conversation, and release reliability.