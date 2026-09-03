---
author: 
id: F_224
internalId: 93f10274-10fd-48a2-9c07-bf50b9f970c8
title: add subscription costs
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__93f10274-10fd-48a2-9c07-bf50b9f970c8.json
policy:
after: a992c823-0635-450a-9f89-af756fdac964
branch: f_224_add_subscription_costs
---
Allow the user to enter agent subscription costs so we can calculate:

* cost per card
* cost per action
* tokens per dollar, derived from tokens per percentage point of account usage

This allows the user to compare different agent configurations.

Account cost is part of the agent profile and is configured with the rest of that agent's settings in the desktop config section. Do not create a separate subscription-cost config list.

Prices are expressed per month. Treat a month as four weeks (28 days) and allocate the price across the number of reported limit windows in that period. A weekly limit therefore exposes 400 percentage points per subscription month.

## Current state

No cost concept exists anywhere in the app today: no cost field in agent profiles, cost type in stats, or cost UI.

Pieces this feature reuses:

* **Agent profile ownership.** `desktop.agentProfiles` (`app/src/services/config/config_entries.ts`) stores each agent's command, models, and defaults. The shared `AgentProfile` type and validation live in `shared/agent_profiles.d.mts` and `shared/agent_profiles.mjs`. Subscription cost belongs on this same profile.
* **Dedicated profile editor.** `desktop.agentProfiles` is rendered by `AgentProfilesEditor` (`app/src/components/config/agent_profiles_editor.tsx`) through the special-case route in `config_value_editor.tsx`; it does not use the generic JSON text editor.
* **Account usage percentage already tracked.** `design/usage_metrics.csv` is parsed by `app/src/services/agents/project_usage_metrics_service.ts` into `UsageMetricsAccountRow` rows: `provider` (`claude` or `codex`), `limitId`, `windowId`, `windowDurationMinutes`, `usedPercent`, and `usedPercentDelta`. A provider can have more than one row series at once, such as a short session window and a weekly window, each with its own `limitId` and `windowId`.
* **Tokens per percentage point already computed.** `app/src/services/stats/stats_usage_comparison_dataset.ts` (`ratioSeriesRow`, `ratioRows`) produces a `tokensPerAccountUsage` ratio per account series: total provider tokens in a time bucket divided by the summed `usedPercentDelta` for that bucket.
* **Tokens per card and action already summed.** `app/src/services/stats/stats_totals_dataset.ts` (`totalsRows`) sums `totalTokens` from `StatsConversationFact` records grouped by `cardInternalId` or `actionId`. Each conversation fact carries its `agent` (`shared/project_stats.mjs`), so tokens are attributable to the agent that produced them.

## Implementation details

* Extend `AgentProfile` with optional `monthlySubscriptionCostUsd`. Keep the field in `desktop.agentProfiles`; do not add another desktop config entry. Update the shared declaration, validation and normalization, app-side parity, desktop config tests, and the existing agent profile form. A configured value must be a finite number greater than zero. Absence means cost calculation is unavailable for that agent.
* Dollar per percentage point for an agent and account series is `monthlySubscriptionCostUsd / (100 * (40320 / windowDurationMinutes))`. Match an account-usage provider to the agent profile with the same name.
* Extend `stats_usage_comparison_dataset.ts` so each existing tokens-per-percentage-point series also produces tokens per dollar. Divide its tokens-per-percentage-point value by the agent's dollar-per-percentage-point value. Preserve the account-series identity: a provider with multiple limit/window series produces a separate estimate for each series.
* Extend the totals calculation and UI so cost per card and cost per action are estimates per account series, rather than implying that an agent has one universal tokens-per-dollar rate. For the active stats range, calculate each provider/series rate from that range's total provider tokens and positive account-usage deltas, convert matching conversations, and aggregate them by card or action. Label each cost result with its account series.
* Skip conversations that cannot be costed because they have no usable provider rate, retain the subtotal from priceable conversations, and list skipped-run counts and reasons in the tooltip. Mark the result unavailable only when no conversation can be priced.
* Do not prorate the subscription price by the selected stats range. Normalize every account percentage point by its reported window duration against the fixed 28-day subscription month.

## Acceptance criteria

* User can enter an optional monthly subscription cost in USD while editing any built-in or custom agent profile in the existing desktop agent-profile editor.
* Subscription cost remains part of `desktop.agentProfiles`; no parallel agent-price config or duplicate agent-to-price mapping is introduced.
* A $100 configured monthly cost makes each weekly account percentage point worth $0.25; other window durations are normalized against the same fixed 28-day month.
* Existing tokens-per-percentage-point figures gain a tokens-per-dollar counterpart for every calculable account series without changing today's token-only figures.
* Cost per card and cost per action are derived from already-tracked conversation tokens and shown per account series wherever per-card/per-action totals are shown today; the series is visible in the result label.
* A cost result includes every priceable conversation and reports skipped-run counts and reasons. It is unavailable only when none of its conversations can be priced.
* Selecting a shorter or longer stats range does not prorate the configured monthly subscription cost; the account window duration determines the conversion.
