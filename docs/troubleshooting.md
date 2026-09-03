# Troubleshooting

## Run buttons are disabled

Running requires a desktop execution backend. In web-only GitHub mode, actions can be edited but not run. Use the desktop app, or connect the browser to a running desktop app through [remote control](guide/remote-control.md).

If you *are* on the desktop and the agent selectors are disabled, md² did not find the agent executable at startup — see below.

## "Unknown agent profile" or an empty model list

md² checks for `codex` and `claude` on the PATH when it starts.

- Confirm the CLI runs from a plain terminal (`codex --version`, `claude --version`).
- Restart md² after installing one; the check happens at startup.
- For a custom profile, check `desktop.agentProfiles`: `name`, `command`, and a non-empty `models` list are required, and an action's `model` must be one of that profile's models.

## GitHub says 401 / unauthorized

The personal access token expired or lacks repository access. Sign in again from the account button and paste a fresh token. Writes need repository contents permission.

## "Unpushed GitHub commits conflict with this branch"

Local pending commits no longer apply to the branch as it now stands. The open-project dialog offers **Discard pending commits**; use it once you are sure the work is either pushed or unneeded.

## Git index lock errors

Another Git process (an editor, a terminal command, an agent) held `.git/index.lock` while md² wanted to write. md² reports the lock path and its age. Wait for the other process to finish, then retry. If nothing is running and the lock persists, the file is stale and can be removed manually.

## An action refuses to run because of a worktree

Actions with `needsWorkTree` need card context plus a valid worktree assignment. Check that:

- the card has a worktree assigned (worktree indicator on the card);
- the assigned index still matches a registered worktree — remove and reassign after removing worktrees;
- the worktree folder exists and is on a named branch, not a detached HEAD.

See [Worktrees](guide/worktrees.md).

## Cards do not appear on the board

- Only Markdown files in the *root* of the working folder are active cards; files in subfolders are background cards.
- The card's `status` must match a configured column. A card whose status matches nothing is not shown.
- Check that `project.projectFolder` and `project.workingFolder` point where you think they do.

## An agent edited a card's status but nothing triggered

`onState` triggers are detected in the running app. Status changes written directly to a file by an external process or another agent do not fire actions.

## A streaming run ended by itself

Closing the project, quitting the app, or the provider process exiting ends a live session. An unexpected exit before **Finish** fails the action; the transcript up to that point is kept. Start a new run to continue — earlier context is sent back through the recorded transcript.

## Phone cannot open the remote-control link

Use the IP link rather than the `.local` hostname; mDNS names do not resolve on all devices, Android in particular. Both must be on the same network, and a firewall may need to allow the port.

## Line-ending churn in diffs

md² keeps the line ending style of the file it edits. If a whole file shows as changed, something else rewrote it — check your editor and `core.autocrlf`.

## Stats data is missing or unavailable

Stats uses saved activity plus the optional timestamped history in `<projectFolder>/usage_metrics.csv`.

- If **Token usage** is unavailable in Activity over time, `usage_metrics.csv` does not exist. New provider turns create timestamped rows; cumulative token totals by card or action may still be available.
- If duration results report omitted conversations, those conversations do not have a saved measured timer. md² does not substitute wall-clock time because it would include time spent waiting for input.
- If performance results report excluded samples, read the reason counts above the chart. Running or waiting conversations and conversations with incomplete or ambiguous attribution are intentionally excluded.
- If estimated cost is unavailable, add **Monthly subscription cost (USD)** to the matching agent profile and select a period with usable positive account-usage observations.
- If project token activity and account usage differ, remember that account observations can include other projects and direct Claude or Codex CLI sessions.
- Malformed account-usage observations can be skipped with a warning. Invalid required activity or token history can make Stats unavailable rather than display misleading partial totals. The source files remain unchanged for inspection.

See [Stats](guide/stats.md) and [How usage and cost are calculated](concepts/usage-and-cost.md) for the complete definitions.

Still stuck? Open an issue with what you did, what happened, and which mode you were in (desktop, remote, GitHub).
