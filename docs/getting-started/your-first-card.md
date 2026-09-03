# Your first card

Ten minutes, from empty board to an agent working on a card.

## 1. Create a card

**New card** in the menu, or the **+** on a board column.

Pick a type (feature, job, bug), type a title, choose the column, and write a body — or keep the template and fill it in later. Press create.

On disk you now have `design/active/F_1_your_title.md` with a header and your body. Commit it whenever you like; md² commits it for you within the auto-commit delay.

## 2. Edit it

Click the card. The popup has the Markdown editor with a formatting toolbar. Everything you type is saved to the file and committed after you stop typing.

Useful things in the popup:

- **Affects** — list the repository files this card touches, with suggestions as you type.
- **Open in file mode** — switch to list view with this card in a tab.
- the card menu — policy toggles, worktree assignment, delete.

## 3. Move it

Drag the card to another column. That rewrites its `status` field, and the `after` field of a couple of neighbours to keep the order.

## 4. Add an action

**New action** in the menu opens an action editor tab. Fill in:

| Field | Value |
| --- | --- |
| Label | `Implement` |
| Description | `Implement this feature` |
| Type | `agent` |
| Prompt | {% raw %}`Read and implement the feature described in {{card-file}}.`{% endraw %} |

Type {% raw %}`{{`{% endraw %} in the prompt for the placeholder list. The action is saved as JSON in the actions folder and appears on your cards.

## 5. Run it

Press **Run** on the card. The action popup opens: add a sentence of run-specific instructions if you want, check the agent, model, and reasoning level, and press **Run**.

Output streams into the popup while the agent works. The card shows **Running**, and its other action entry points are disabled until the run ends.

## 6. Look at what happened

- The conversation stays attached to the card — reopen it any time.
- Commits made during the run are listed under the card's commit icon, with their diff.
- Token usage is shown per run, per card, and in the status bar for the project.
- Open **Stats** from the Board/List/Stats switch to compare activity, performance, token usage, and estimated cost by card or action.

## Where to go next

- [Actions and agents](../concepts/actions-and-agents.md) — the model behind actions.
- [Cookbook](../actions/cookbook.md) — ready-made action definitions.
- [Worktrees](../guide/worktrees.md) — several agents at once, one branch each.
- [Stats](../guide/stats.md) — understand where agent time, tokens, and subscription value are spent.
