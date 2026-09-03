# Stats

Stats connects agent activity to the cards, actions, and releases where the work happened. Use it to compare workflows, find expensive work, and export the displayed data for further analysis.

Select **Stats** beside **Board** and **List** in the application menu. The Stats workspace is available in the desktop app and on remotely connected devices.

## Choose what to measure

The **Dataset** control offers four views:

| Dataset | Questions it answers |
| --- | --- |
| **Activity over time** | How many cards and actions were completed? How many project tokens were used? |
| **Agent/model performance** | Which agents or models use the most measured time, tokens, or tool calls? |
| **Project usage vs account usage** | How does project work compare with Claude and Codex account-limit consumption? What is the estimated subscription cost? |
| **Totals by Card/Action** | Which cards or reusable actions account for the most time, tokens, or estimated cost? |

All datasets share the **Releases**, **From**, and **To** controls. Dates are entered in local time. Charts group values by UTC day, week, or month where the selected dataset supports that choice.

Select **Export CSV** to download the currently displayed dataset with its active filters. Exporting does not change the project's `usage_metrics.csv` file.

## Activity over time

Choose **Distinct cards**, **Completed actions**, or **Token usage**, then group the results by day, week, or month.

- A card is counted once in a time bucket when it has at least one completed action there.
- Completed actions count root actions, including actions whose main work completed but whose after-action failed.
- Token usage over time comes from timestamped provider turns in `usage_metrics.csv`.

Use this dataset to see delivery volume and activity trends. Use the other datasets when you need to compare agents, models, cards, or costs.

## Agent/model performance

Choose measured duration, tokens, or tool calls, then group by agent or model. You can narrow the chart to particular actions, agents, or models.

The available aggregations are:

- **Sum** — the combined value of the included action conversations.
- **Average** — the arithmetic mean per included action conversation.
- **Average ± std dev** — the average plus a whisker showing one population standard deviation.
- **Median** — the middle value after the included conversations are sorted.

Measured duration counts time while an agent is running. Time spent waiting for user input is excluded. Completed, failed, and cancelled conversations can all contribute because each may consume time, tokens, and tool calls. The notice above the chart explains why any samples were excluded.

## Project usage vs account usage

This dataset aligns several day- or week-based charts:

- Account usage.
- Project token usage, as totals and as an average per completed action.
- Tokens per percent of account limit used.
- Tokens per dollar.
- Estimated cost per agent.
- Average cost per action.
- Actions per percent of account limit used.
- Project activity by agent and action.

Claude and Codex series keep distinct color families across these charts. Hover or focus a bar for its exact value and calculation context.

Account usage is account-wide. It may include other projects and direct CLI sessions, so these charts compare project work with account consumption; they do not prove that all account consumption came from this project.

Cost charts require a monthly subscription cost on the matching agent profile. See [Configure cost estimates](#configure-cost-estimates) and [How usage and cost are calculated](../concepts/usage-and-cost.md).

## Totals by card or action

Group by **Card** to find costly features and bugs, or by **Action** to compare reusable workflows. Choose measured duration, token usage, or estimated cost.

An estimated-cost total can include conversations from different agents. md² prices each supported conversation with its agent's calculated rate and labels the result **Mixed** when more than one agent contributed. The tooltip reports conversations that could not be priced instead of silently treating them as free.

## Select a release

Stats opens on **Current release**. The **Releases** control also lists each completed release discovered in the configured releases folder.

Release selection applies to activity, performance, card/action totals, and other activity-derived results. Timestamped project-token and account-usage rows cannot be assigned to a release, so they remain controlled by the date range only.

## Configure cost estimates

1. Open configuration with the gear button.
2. Open **Desktop** and edit the relevant agent profile.
3. Enter **Monthly subscription cost (USD)**.
4. Save the configuration.

The value must be greater than zero. It represents a monthly subscription price, not an API token price. md² combines it with observed account-limit consumption to estimate cost. If the price or usable account history is unavailable, token and time charts still work but the affected cost values remain unavailable.

## Missing or partial data

Stats is calculated from saved activity and `usage_metrics.csv`:

- Older conversations without a measured timer are omitted from duration results.
- Token usage over time is unavailable when `usage_metrics.csv` is missing.
- A newly configured subscription cost cannot price periods without usable account observations.
- Running and waiting conversations are not final performance samples.
- Invalid required activity data makes Stats unavailable instead of displaying misleading partial totals.

See [Troubleshooting](../troubleshooting.md#stats-data-is-missing-or-unavailable) for common causes.

See also: [How usage and cost are calculated](../concepts/usage-and-cost.md), [Agent setup](../actions/agent-setup.md), [Board view](board-view.md).
