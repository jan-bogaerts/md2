---
author: 
id: B_153
internalId: 4dec109e-fb6d-4cd6-92b2-741a5ad92f66
title: check claude token count
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__4dec109e-fb6d-4cd6-92b2-741a5ad92f66.json
policy:
---

token usage count for claude seems way higher than that of codex while codex runs more, so perhaps there is something going wrong in the way that claude token usage is counted. we need to check this.

## Current state

md2 reads Claude usage only from terminal `result` event. Claude reports one aggregate for all model requests made while handling that user prompt; `num_turns` is model-request count inside agent run, not md2 conversation count. Each tool result can cause another model request that processes growing conversation context.

`claudeUsage` puts `input_tokens` in fresh input, combines `cache_creation_input_tokens` and `cache_read_input_tokens` as cached input, keeps `output_tokens` as output, and computes total from those disjoint buckets. One-shot path stores result in `run.turnUsage`; streaming path emits one `turnCompleted` event. Both add terminal result once. Assistant-message usage is ignored, so no second accumulation path was found.

Current `design/usage_metrics.csv` supports cache explanation: 14 Claude records contain 6,853,464 tokens, of which 6,748,827 (98.5%) are cached input. 100 Codex records contain 12,000,717 tokens, of which 9,438,720 (78.7%) are cached input. Claude average is therefore higher per completed md2 turn even though Claude ran fewer times. Provider token usage means tokens processed across provider model requests; it is not visible response length, context-window size, md2 run count, or account-quota percentage. Raw totals from different providers therefore do not measure equal work.

## implementation details

- Keep Claude terminal `result.usage` as authority. Do not sum assistant-message usage and do not subtract prior results from resumed sessions: each result describes newly completed prompt handling.
- Add sanitized Claude fixtures covering multiple internal turns, cache creation, cache reads, one-shot execution, streaming execution, and a resumed follow-up. Assert normalized total equals fresh input plus both cache buckets plus output, and each terminal result reaches conversation and `usage_metrics.csv` exactly once.
- Add regression coverage proving assistant-message usage does not contribute, repeated streaming protocol messages do not duplicate terminal usage, and two successful resumed prompts add their two result aggregates once each. Failed, cancelled, malformed, or usage-less results add nothing.
- Clarify usage copy in project and action summaries: label total as cumulative provider tokens processed, and define cached input as cache writes plus cache reads reported by provider. Keep bucket details and provider-reported cost visible. Do not change persisted usage schema or rewrite historical totals.
- Use captured provider values as assertions; do not compare Claude and Codex by md2 run count. Their agent loops, models, context lengths, and cache reporting differ.

## acceptance criteria

- Claude fixture total equals `input_tokens + cache_creation_input_tokens + cache_read_input_tokens + output_tokens`; each bucket appears once.
- One successful Claude prompt adds exactly one terminal result aggregate to conversation, project summary, and token-usage CSV. Streaming, one-shot, and resumed prompts follow same rule.
- Assistant-message usage, duplicate non-terminal events, failed results, cancellations, and missing usage never increase total.
- Two successful prompts in same resumed Claude session add only usage from their two result events; earlier session usage is not added again.
- UI defines displayed value as cumulative provider tokens processed and explains that cached input contains provider-reported cache writes and reads. It does not imply token total equals response length, run count, context occupancy, or account quota.
- Existing persisted usage remains readable and unchanged. Codex normalization, project aggregation, and account-usage metrics do not change.
