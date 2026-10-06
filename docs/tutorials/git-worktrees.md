# Tutorial: Git worktrees

Run several agents on the same repository at once, each on its own branch in its own folder, and bring their work back into the project branch. Worktrees need local Git: the desktop app, or a browser connected through remote control.

## 1. Set up worktrees

Open the config dialog → section **Project** → **Linked worktrees**.

1. Press **Add linked worktree** (the **+** button) and pick a folder for it. Repeat once per agent you want to run in parallel.
2. Press **Save**. md² creates each worktree and parks it on its own branch (`md2/parking/…`) until a card claims it.

The list shows each worktree's folder, branch, and status. **Remove worktree** unregisters one, after warning about anything that would be lost.

## 2. Make actions run in the worktree

An action runs in the opened project folder unless it says otherwise. Switch on **Needs worktree** in the action editor (`"needsWorkTree": true`) on actions that change code, such as implement and fix. Such an action only runs on a card with a valid worktree assignment.

In prompts and commands, {% raw %}`{{worktree-folder}}`{% endraw %} is the folder the run uses. The card file itself stays in the opened repository, so use {% raw %}`{{repository-folder}}`{% endraw %} when an agent must update the card from inside a worktree.

Reference: [Action definition](../actions/action-definition.md), [Placeholders](../actions/placeholders.md).

## 3. Assign a worktree to a card

Click the worktree indicator on the card (or use the selector in the card properties) and pick a worktree. md² writes its number into the card's `worktree` header field.

- A worktree serves one active card at a time.
- **project folder** clears the assignment.
- A number that no longer matches a registered worktree shows as a worktree error on the card.

Now run the implement action. Repeat with a second card and a second worktree to have two agents working side by side.

## 4. Commit

The worktree menu on the card has **Commit**: type a message and the worktree's changes are committed on its branch. Commits made by the agent during a run are recorded on the card as well; the card popup shows their diffs.

Status (ahead, behind, dirty) refreshes after a run on the card finishes, and the menu enables commands to match.

## 5. Keep up with the project branch

When other work has landed on the project branch, the worktree is behind. **Update worktree** rebases the worktree's branch onto the project branch. If the worktree has uncommitted changes, md² asks for a commit message first.

## 6. Merge back

When the work is done, **Integrate into project**:

1. Type a commit message if the worktree has uncommitted changes.
2. Leave **Delete branch** checked to remove the card's branch afterwards.
3. Press **Integrate**.

md² first rebases the worktree onto the project branch when needed, then squash-merges the card's changes into the project branch as a single commit.

Video: [Merge an agent's worktree branch](https://github.com/user-attachments/assets/8d9b4f55-6d97-42ff-bba4-ef36c5a64513).

## 7. Resolve merge conflicts

When two worktrees changed the same lines, **Update worktree** or **Integrate into project** stops at the conflict and the **Resolve merge conflicts** dialog opens. Git stays paused until you continue or cancel.

For each conflicted file you can:

| Button | What it does |
| --- | --- |
| **External resolver** | Opens the file in your merge tool. Configure it first: config dialog → **Desktop** → **Merge conflict resolver command**, with {% raw %}`{{file}}`{% endraw %} in the command. |
| *agent action* | Runs an agent to resolve this file. |
| **Mark resolved** | Stages the file once its conflict markers are gone. |

Below the files, the same agent actions can resolve **all remaining files** in one run. The dialog rescans the files when the agent finishes.

When every file is staged, press **Continue** to finish the rebase or merge. **Cancel** aborts the Git operation and leaves things as they were.

### The agent action

Agent buttons appear for agent actions with `appliesTo.kind` set to `merge-conflict`. A minimal one:

```json
{
  "id": "resolve-conflict",
  "label": "Resolve with agent",
  "description": "Resolve the merge conflict",
  "type": "agent",
  "prompt": "We have a merge conflict. Resolve it, keeping the intent of both sides.",
  "streaming": true,
  "appliesTo": { "kind": "merge-conflict" }
}
```

Streaming keeps the conversation open, so you can check the agent's choices before pressing **Finish**.

Video: [Resolve merge conflicts between worktrees](https://github.com/user-attachments/assets/c04324ce-273d-43b7-b739-02c7011cefad).

Reference: [Worktrees](../guide/worktrees.md), [Git and commits](../guide/git-and-commits.md), [Troubleshooting](../troubleshooting.md).

## Next

[Sequencing and scheduling cards](sequencing-and-scheduling.md).
