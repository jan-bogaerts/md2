# Tutorial: sequencing and scheduling cards

Decide in which order cards are worked on, and let md² start the work for you: when a card reaches a column, at a set time, when your agent account usage resets, or one card after another.

Running actions without you pressing **Run** needs the desktop app.

## 1. Order cards in a column

Drag cards up and down a column to set their order. The board is your priority list: top first.

The order is stored in the card files themselves. Each card's `after` header field holds the `internalId` of the card directly above it in the same column. The top card has no `after`.

- Dragging a card rewrites only the moved card and its neighbours, so diffs and merges stay small.
- Deleting a card relinks the card below it to the card above it.
- When `after` points to a card in another column, or to a card that no longer exists, the card is treated as the top of its own chain.

`after` is ordering only. md² does not block a card from running because the card above it is unfinished. To make one card wait for another, use a schedule or a sequence (below).

Reference: [Cards and files](../concepts/cards-and-files.md).

## 2. Start an action when a card enters a column

Two ways to tie actions to columns:

- **Default action** per column (config dialog → **Project** → board columns → **Default action**). Preselects the action when you press **Run** on a card in that column. You still press **Run**.
- **State trigger**: an action with `onState` set to a column runs as soon as a card is dragged into that column.

```json
{
  "id": "push-on-ready",
  "label": "Push",
  "description": "Push the current branch",
  "type": "command",
  "command": "git -C {% raw %}{{worktree-folder}}{% endraw %} push",
  "onState": "ready"
}
```

State triggers only fire for state changes made in the app. A card whose status is changed in the file by an agent or another tool does not trigger the action.

## 3. Chain actions

Compose small actions instead of one large prompt:

- `onBefore`: runs first, in order.
- `on`: runs when the action's output matches a regular expression, for example a failing test count.
- `onAfter`: runs after the action and its matching `on` actions succeed.

A typical chain: implement → run tests → on failure, fix → commit. Any failing link stops the chain and the log shows which link broke.

In a streaming action, **Finish** ends the conversation and lets the chain continue. Ctrl+click or long-press **Finish** to choose between stopping the remaining linked actions and finishing only this conversation.

Reference: [Running actions](../actions/running-actions.md), [Cookbook](../actions/cookbook.md).

## 4. Schedule one action

In the action popup, press **Schedule** and choose the trigger:

| Trigger | Starts the action |
| --- | --- |
| **Set date and time** | At the chosen moment. |
| **When account usage resets** | When the chosen agent's usage limit window resets. Use it to queue work until you have capacity again. |
| **When another card enters state** | When the chosen card reaches the chosen column. This is how one card waits for another. |

Schedules are stored in the repository. The desktop app registers them when the project loads, so they survive a restart.

## 5. Run a sequence of cards

A sequence runs one action on several cards, one card at a time, in the order you choose.

1. **Run** tab of the menu → **Add sequence**.
2. Add cards with **Add cards**, or drag them from the board into the list. Drag inside the list to reorder; **Delete** removes the selected card.
3. Pick the action. Only actions that apply to every card in the list are offered.
4. Pick the **Ready state**: the column a card must reach before the sequence moves on.
5. Pick when to start: **Now**, or one of the schedule triggers from step 4.
6. Press **Start** (or **Schedule**).

For each card, md² runs the action without asking you anything. The sequence moves to the next card only when the action completed **and** the card is in the ready state. A failed or cancelled run stops the sequence.

Example: an implement action that sets the card status to `ready` when done, run as a sequence with ready state `ready`, implements a stack of cards overnight, one after the other.

## 6. Watch and cancel

**Run** tab → **View active schedules** lists every pending schedule and sequence with its trigger. Select one to **Open** its target or **Delete** it.

## Next

[Working with diagrams](working-with-diagrams.md).
