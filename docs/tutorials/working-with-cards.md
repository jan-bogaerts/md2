# Tutorial: working with cards

Take one feature from idea to release: create, describe, design, implement, review, release. Each step is a card edit, an action run, or a drag between columns.

Before you start: an open project ([Getting started](getting-started.md)) and at least one agent CLI.

## The standard process

A card moves through the board columns. A typical column set:

| Column | What happens there | Typical action |
| --- | --- | --- |
| `new` | You write down the request. | — |
| `design` | An agent completes the description: current state, implementation details, acceptance criteria. | `complete` |
| `ready for implementation` | An agent implements the card. | `implement` |
| `to fix` | Problems found during review wait here. | `fix` |
| `ready` | An agent reviews the result; you integrate and release. | `review` |

Columns are project configuration (config dialog → **Project** → `project.states`). Each column can have a **Default action**: the action preselected when you press **Run** on a card in that column. That is how one **Run** button does the right thing in every column.

The action names above are examples. Write your own in the action editor, or start from the [Cookbook](../actions/cookbook.md).

## 1. Create and describe

1. Press **+** on the `new` column.
2. Pick a type (feature, job, bug) and type a title.
3. Write what you want in the body. Rough is fine: a few bullet points.

md² creates a Markdown file in the working folder, for example `F_12_my_feature.md`, and commits it after the auto-commit delay.

Reference: [Your first card](../getting-started/your-first-card.md), [Cards and files](../concepts/cards-and-files.md).

## 2. Use the editor

Click the card to open the card popup, or **Open in file mode** to edit it in a list view tab.

- The formatting toolbar handles bold, lists, links, images, tables, and code blocks.
- **Affects** lists the repository files the card touches, with suggestions as you type. The list is stored in the card header, where agents reading the card see it.
- The card menu holds policy toggles (named flags such as "needs review"), worktree assignment, and delete.
- In list view, **Properties** shows the header fields and **Agents** opens the conversation panel beside the document.

Edits are saved to the file and committed after you stop typing.

Reference: [Board view](../guide/board-view.md), [List view](../guide/text-view.md).

## 3. Design with an agent

Drag the card to `design` and press **Run**. The action popup opens with the column's default action selected.

1. Add run-specific instructions in the prompt box if you want. They reach the prompt through {% raw %}`{{card-prompt}}`{% endraw %}.
2. Check the agent, model, and reasoning level. Changes here apply to this run only.
3. Press **Run**.

For a streaming action, the conversation stays open: answer the agent's questions, then press **Finish**. An action with `autoFinish` finishes by itself when the agent moves the card to the configured column.

Read the result in the card. Edit it until it says what you want.

Reference: [Running actions](../actions/running-actions.md), [Actions and agents](../concepts/actions-and-agents.md).

## 4. Implement

Drag the card to `ready for implementation` and press **Run** again. For parallel work, assign a worktree first; see [Git worktrees](git-worktrees.md).

While the agent runs, the card shows **Running** and its other action entry points are disabled. One action at a time per card.

## 5. Follow the conversation

The conversation belongs to the card. Open it from the card's conversation icon, from the action popup's previous runs, or with **Agents** in list view.

- Send a next turn to steer the agent.
- Use phrase buttons, if the action defines them, for replies you type often.
- Pick another agent mid-conversation; md² migrates the conversation.

Logs are stored in the `activity` folder and stay attached to the card.

## 6. Review the result

- **Commits**: the commit icon in the card popup lists the commits made during runs, each with its diff.
- **Review action**: run an agent that checks the implementation against the card. Move problems to `to fix` and run the fix action.
- **Usage**: token usage per run and per card; **Stats** compares cards and actions.

Reference: [Git and commits](../guide/git-and-commits.md), [Stats](../guide/stats.md).

## 7. Release

When the cards in `ready` are done, **Complete release** on the **Run** tab of the menu asks for a release name and moves every active card into a new subfolder of the releases folder, leaving the board empty for the next cycle. Cards you want gone without releasing them go to the archive instead.

Reference: [Release process](../contributing/release-process.md), [Project layout](../concepts/project-layout.md).

## Next

[Git worktrees](git-worktrees.md) or [Sequencing and scheduling cards](sequencing-and-scheduling.md).
