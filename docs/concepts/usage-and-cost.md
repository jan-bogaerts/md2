# How usage and cost are calculated

Stats uses saved project activity and provider observations. This page defines what the figures mean and where their limits are.

## Data sources

| Source | What it provides |
| --- | --- |
| Card and project activity files | Action status, agent and model attribution, conversations, measured duration, tool calls, and cumulative conversation tokens |
| `usage_metrics.csv` | Timestamped project-token deltas and observed Claude or Codex account-limit changes |
| Agent profiles | Optional monthly subscription cost used for estimates |

Current activity is stored under the configured project activity folder. Activity from completed releases is loaded from the configured releases folder. Stats keeps release membership from those locations; paths are not used as card or conversation identity.

## Actions and cards

A completed action is a terminal root action with status `completed` or `okButNotAfter`. The second status means the root action completed but an after-action failed. Nested before-, on-, and after-actions do not add to the root completed-action count.

A card is counted once per time bucket when it has at least one completed root action in that bucket. Project-level actions count as actions but not as cards.

## Performance samples

One performance sample is one canonical root agent conversation, including its continuations. Continuing the same conversation does not create another sample.

Completed, failed, and cancelled conversations are included when the chosen metric is measurable. Running or waiting conversations are excluded until they become terminal. Conversations are also excluded when agent/model attribution is missing or inconsistent, their completion time is missing, nested agent conversations make attribution ambiguous, or measured duration was not stored.

## Measured duration

Measured duration comes from the conversation's saved running timer. It accumulates while the agent is running and excludes time spent waiting for user input.

md² does not estimate missing duration from the difference between start and completion timestamps. That difference would include waiting and could overstate agent time. Legacy conversations without a timer therefore remain available for supported token and tool-call statistics but are omitted from duration statistics.

## Token usage

Per-card and per-action token totals use each canonical conversation's cumulative provider-reported usage once.

Token usage over time uses per-turn deltas recorded in `usage_metrics.csv`. This preserves when the usage happened: continuing a conversation, reloading a project, moving a card, or completing a release does not move earlier tokens into a later bucket.

If `usage_metrics.csv` is absent, cumulative card and action totals can still be available while token-by-time charts are not.

## Tool calls

Performance charts count unique saved tool invocations, including attempted calls that failed. Tool results, messages, reasoning, plans, diagnostics, and other non-invocation events are not tool calls.

## Account usage

Claude and Codex account observations describe the provider account, not only the open project. They can include usage from:

- Other md² projects.
- Agent CLI sessions started outside md².
- Other activity reported through the same subscription window.

For that reason, project tokens and completed actions are compared with account usage as a correlation. Account-limit consumption must not be described as usage caused exclusively by the selected project.

Different provider limits and reset windows remain separate. Stats does not add unlike account windows together. Negative corrections in provider telemetry are not used for displayed ratios or estimates.

## Estimated subscription cost

Cost values are estimates, not provider invoices or metered API-token charges.

For each agent, md² uses the optional `monthlySubscriptionCostUsd` from its profile. A subscription month is normalized to 28 days. The price of one percentage point of a reported account window is:

```text
monthly subscription cost / (100 × number of account windows in 28 days)
```

For example, a $100 monthly cost and a weekly account window produce 400 percentage points across four weeks, so one percentage point is valued at $0.25.

Time-based estimated cost is the observed positive account-limit change multiplied by that normalized value. Average cost per action divides the bucket estimate by the number of completed agent actions in that bucket.

Card and action cost totals derive an effective tokens-per-dollar rate for each agent from the selected period. Each priceable conversation is valued with the rate for the agent that ran it, then the values are added. Where a provider reports several windows, md² uses its longest-duration window. Conversations without a usable rate are omitted and reported in the tooltip; a supported subtotal remains visible.

## Releases and dates

Activity facts retain release membership, so activity, performance, and card/action totals can be filtered to the current release or one completed release.

Rows in `usage_metrics.csv` have timestamps and providers but no card or release identity. Release selection therefore cannot change telemetry-only token or account series. Use the shared date range to limit those rows.

Date inputs are local-time controls. Day, ISO-week, and month buckets use UTC boundaries, and CSV exports keep UTC ISO-8601 timestamps.

## CSV export

Export contains the currently selected dataset and filters, including stable identities and exact values used by the chart. Display formatting may round a chart label or tooltip, while the CSV retains the underlying numeric value.

Exporting creates a browser download. It never rewrites the project's source `usage_metrics.csv`.

See also: [Use Stats](../guide/stats.md), [Agent setup](../actions/agent-setup.md).
