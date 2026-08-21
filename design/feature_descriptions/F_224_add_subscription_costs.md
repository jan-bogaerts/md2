---
author: 
id: F_224
internalId: 93f10274-10fd-48a2-9c07-bf50b9f970c8
title: add subscription costs
status: ready
owner: 
affects:
agents:
  - design/activity/card__93f10274-10fd-48a2-9c07-bf50b9f970c8.json
policy:
after: 97733177-b4c8-47c3-af3d-64c31d4eca93
branch: f_224_add_subscription_costs
worktree: 1
---
Allow the user to enter agent subscription costs so we can calculate:

* cost per card
* cost per action
* tokens per dollar, derived from tokens per percentage point of account usage

This allows the user to compare different agent configurations.

Account cost is part of the agent profile and is configured with the rest of that agent's settings in the desktop config section. Do not create a separate subscription-cost config list.

Prices are expressed per month. For this feature, a $100 subscription represents 100% account usage, so one percentage point is worth $1.

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
* Dollar per percentage point for an agent is `monthlySubscriptionCostUsd / 100`. Match an account-usage provider to the agent profile with the same name.
* Extend `stats_usage_comparison_dataset.ts` so each existing tokens-per-percentage-point series also produces tokens per dollar. Divide its tokens-per-percentage-point value by the agent's dollar-per-percentage-point value. Preserve the account-series identity: a provider with multiple limit/window series produces a separate estimate for each series.
* Extend the totals calculation and UI so cost per card and cost per action are estimates per account series, rather than implying that an agent has one universal tokens-per-dollar rate. For the active stats range, calculate each provider/series rate from that range's total provider tokens and positive account-usage deltas, convert matching conversations, and aggregate them by card or action. Label each cost result with its account series.
* If the active range has no positive usage denominator, no matching agent profile, no configured subscription cost, or a conversation whose agent cannot be costed for that series, report the affected cost result as unavailable rather than returning a partial or zero result.
* Do not prorate the subscription price by the selected date range. This feature values account-usage percentage points directly using the rule above, so no calendar-month or 28-day conversion is needed.

## Acceptance criteria

* User can enter an optional monthly subscription cost in USD while editing any built-in or custom agent profile in the existing desktop agent-profile editor.
* Subscription cost remains part of `desktop.agentProfiles`; no parallel agent-price config or duplicate agent-to-price mapping is introduced.
* A $100 configured monthly cost makes each percentage point of that agent's account usage worth $1 everywhere account usage is converted to dollars.
* Existing tokens-per-percentage-point figures gain a tokens-per-dollar counterpart for every calculable account series without changing today's token-only figures.
* Cost per card and cost per action are derived from already-tracked conversation tokens and shown per account series wherever per-card/per-action totals are shown today; the series is visible in the result label.
* A cost result is unavailable, not zero or partial, when its required subscription price, positive usage denominator, matching series, or conversation cost is unavailable.
* Selecting a shorter or longer stats range does not prorate the configured monthly subscription cost.
