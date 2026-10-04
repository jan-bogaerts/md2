---
author: 
id: F_335
internalId: 22e1a692-a35c-4fe0-a4ea-70545e3e6009
title: include cost per release
status: ready
owner: 
affects:
agents:
  - design/activity/card__22e1a692-a35c-4fe0-a4ea-70545e3e6009.json
policy:
after: 11011a61-0393-4aa1-9b89-f52be576aa72
changedFiles:
  - app/src/components/shell/project_agent_usage_details.test.tsx
  - app/src/components/shell/project_agent_usage_details.tsx
  - app/src/components/shell/project_agent_usage_summary.test.tsx
---
The status bar shows total token usage. Clicking it opens a popup with project totals and Current, Archived, and release rows. Show the existing provider-reported cost beside token usage in this popup, rather than only in the token tooltip.

Cost means the stored USD amount reported by an agent provider (`costUsd`). When this field is absent, show "Data missing". Do not estimate costs.

## Current state

* `ProjectAgentUsageSummary` opens `ProjectAgentUsageDetails` on desktop and mobile. Both project totals and version rows use `AgentUsageDisplay`, which shows tokens visibly and reported cost only in its tooltip.
* `projectAgentTokenUsage` already supplies stored project and release costs from `agent_token_usage.json`; Current and Archived use loaded conversation usage. Release completion already calculates and persists reported release costs.
* Cost aggregation skips absent costs. An existing amount is the sum of reported costs; it does not prove that every conversation reported cost.

## Implementation details

* In `app/src/components/shell/project_agent_usage_details.tsx`, render a visible cost label beside token usage for project total and each Current, Archived, and release row. Read each row's existing `usage.costUsd`.
* Display present values as USD, including zero. Use the existing cost formatting convention: at least two and at most six decimal places. Display `Cost: Data missing` when `costUsd` is absent. Describe amounts as reported costs so partial reported sums do not imply complete billing data.
* Keep `AgentUsageDisplay` unchanged: its other production consumer, `CardBodyPopover`, retains existing presentation. Desktop popup and mobile dialog share the updated details component. Follow `design/STYLE_GUIDE.md`.
* No changes to cost calculation, summary schema, persistence, release completion, or project loading. No migration, backfill, or pricing lookup. Opening the popup must not scan activity files or write data.

## Acceptance criteria

* Opening project usage on desktop or mobile shows tokens and visible reported USD cost for project total and every version row that has `costUsd`, without hovering.
* Missing `costUsd` shows `Cost: Data missing`; an explicit zero shows a zero USD amount. Missing data is never estimated or replaced with zero.
* Displayed amounts use existing usage values. Opening or reopening details does not recalculate released costs or change stored data.
* Existing token labels, tooltips, version ordering, and card popover presentation remain unchanged.
* Focused UI tests cover visible project/release costs, Current/Archived costs, missing values, zero, and desktop/mobile details. Run affected UI tests and app lint during implementation.
