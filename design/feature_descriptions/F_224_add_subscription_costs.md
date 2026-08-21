---
author: 
id: F_224
internalId: 93f10274-10fd-48a2-9c07-bf50b9f970c8
title: add subscription costs
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__93f10274-10fd-48a2-9c07-bf50b9f970c8.json
policy:
after: 97733177-b4c8-47c3-af3d-64c31d4eca93
---
Allow the user to enter agent subscription costs so we can calculate things like:

* cost per card
* cost per action
* tokens per dollar (derived from tokens per % account usage).&#x20;

this allows the user to compare different configurations.

account cost should be configured from where the rest is configured for the agents: in the desktop config section.

prices are expressed per month

if we need to do complex time calculations, we can keep things perhaps simpler if we presume 4 weeks per month (28 days), that makes it easier.&#x20;

so if 100$ \= 100% account usage, 1% \= 1$

## Current state

No cost concept exists anywhere in the app today — no cost field in config, no cost type in stats, no cost UI.

Pieces this feature reuses:

* **Desktop config precedent.** `desktop.agentProfiles` (`app/src/services/config/config_entries.ts:325-334`) already stores an array of per-agent objects, of type `json`, edited in the desktop config section (`app/src/components/config/config_page.tsx`, `app/src/components/config/config_value_editor.tsx`). A new per-agent monthly-cost field would follow this same shape and location.
* **Account usage percentage already tracked.** `design/usage_metrics.csv` is parsed by `app/src/services/agents/project_usage_metrics_service.ts` into `UsageMetricsAccountRow` rows: `provider` (`claude` or `codex`), `limitId`, `windowId`, `windowDurationMinutes`, `usedPercent`, `usedPercentDelta`. A provider can have more than one row series at once — e.g. a short session-length window and a longer weekly window — each tracked with its own `limitId`/`windowId`.
* **Tokens per percentage point already computed.** `app/src/services/stats/stats_usage_comparison_dataset.ts` (`ratioSeriesRow`, `ratioRows`) already produces a `tokensPerAccountUsage` ratio per account series: total provider tokens in a time bucket divided by the summed `usedPercentDelta` for that bucket. This is exactly "tokens per % account usage" the feature text asks for — it just isn't expressed in dollars yet.
* **Tokens per card / per action already summed.** `app/src/services/stats/stats_totals_dataset.ts` (`totalsRows`) already sums `totalTokens` from `StatsConversationFact` records grouped by `cardInternalId` or `actionId`. Each conversation fact also carries `agent` (`shared/project_stats.mjs`), so tokens spent on a card or action are already attributable to the agent (`claude`/`codex`) that produced them. Only the token-to-dollar conversion is missing.

## Implementation details

* Add a new config entry, e.g. `desktop.agentSubscriptionCosts`, typed as an array of `{ provider: string; monthlyCostUsd: number }`, following the exact array-of-typed-object / `type: 'json'` pattern `desktop.agentProfiles` already uses (`app/src/services/config/config_entries.ts`). Render it in the desktop config section next to the existing agent profile editor — no new UI component pattern is needed, the existing JSON config editor (`config_value_editor.tsx`) already handles arrays of objects.
* Dollar-per-percentage-point for a provider \= `monthlyCostUsd / 100` (the "$100 \= 100%, so 1% \= $1" rule from above).
* Extend the ratio calculation in `stats_usage_comparison_dataset.ts` so each existing `tokensPerAccountUsage` series (tokens per percentage point) can also be expressed as tokens per dollar: since 1 percentage point \= `monthlyCostUsd / 100` dollars, tokens-per-dollar is the existing tokens-per-percentage-point ratio divided by that same conversion factor. Apply this per account series exactly as today's ratio is computed per series — no new logic is needed to pick "the" window for a provider that has multiple limit series; each series keeps producing its own figure, same as `accountUsage`/`tokensPerAccountUsage` do today.
* Extend `stats_totals_dataset.ts` (`totalsRows`) so, alongside the existing per-card/per-action token total, a per-card/per-action dollar total can be produced: for each conversation being summed, convert its `totalTokens` to dollars using its `agent`'s tokens-per-dollar rate (from the calculation above) before adding it to the running total.
* Wherever a monthly figure must be related to a duration (e.g. pro-rating cost against a stats date range shorter or longer than a month), presume 1 month \= 4 weeks \= 28 days, per the feature text, instead of calendar-accurate month lengths.

## Acceptance criteria

* User can enter a monthly subscription cost (USD) per agent (`claude`, `codex`) in the desktop config section, using the same list/JSON editing pattern as the existing agent profiles list.
* $100 configured monthly cost is treated as 100% of that agent's account usage, so each 1% of usage is worth $1; this conversion is applied consistently everywhere an account-usage percentage is turned into a dollar figure.
* The existing "tokens per % account usage" figures gain a dollar-denominated counterpart (tokens per dollar) without changing today's token-only figures.
* Cost per card and cost per action are derived from each card's/action's already-tracked total tokens (grouped by the agent that produced them) combined with that agent's tokens-per-dollar rate, and are viewable wherever per-card/per-action totals are shown today.
* If no subscription cost is configured for an agent, cost figures involving that agent are reported as unavailable rather than shown as zero or causing an error.
* Time-to-month conversions use the 4-week/28-day approximation stated in the feature text.