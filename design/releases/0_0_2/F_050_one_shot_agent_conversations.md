---
id: F-050
title: one-shot agent conversations with provider switching
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 8397c63f-d95d-4c05-b808-e48df77676c8
---

## Goal

Run every non-streaming Codex and Claude conversation turn as a one-shot process with structured output, persist the full MD² transcript and provider conversation ids, and let the user continue a conversation with either agent without losing context. Agent actions with `streaming: true` use the live-session contract in F_75.

## Current state

Implemented for non-streaming actions. Each turn uses a structured subprocess, conversation logs retain the complete transcript, and provider-session records support explicit resume and provider switching. Configured commands remain authoritative. Agent actions with `streaming: true` use one live provider process until Finish or Cancel, as defined by F_75.

## Requirements

### One process per one-shot turn

- For non-streaming actions, keep the conversation interactive in MD², but run each user turn as a separate process. Do not keep a Codex or Claude process alive between turns.
- Run Codex with `exec --json` and Claude with `--print --verbose --output-format stream-json` so output is streamed as structured events.
- Pass the current user message as the prompt argument. The initial prompt and every follow-up must support multiline content without shell interpolation or command-line corruption.
- Use normal subprocess stdin/stdout/stderr pipes rather than a PTY. One-shot structured modes do not require terminal emulation.
- Stream structured events into the existing live execution UI from memory. Persist the conversation once at terminal completion. Disable additional conversation input while a turn is running; do not send follow-up text to the active process.
- Cancellation terminates only the current turn. A failed or cancelled turn does not advance the provider continuation cursor.

### Persisted conversation

- The card or project activity file in the primary checkout is the persisted source of truth and always stores the full ordered transcript. Do not truncate stored messages.
- Store user and assistant messages separately from provider event noise. Keep structured tool, command, file-change, usage, failure, and lifecycle events in the event list when needed for the execution UI and audit history.
- Record which agent produced each assistant turn.
- Replace the single `nativeSessionId` concept with provider-session records. Each record contains at least:
  - agent/profile name;
  - provider conversation id;
  - transcript message id through which that provider session is synchronized;
  - creation and last-use timestamps.
- Parse ids from structured provider output, not free-text regular expressions:
  - Codex: `thread.started.thread_id`;
  - Claude: `session_id` from structured output.
- Persist the transcript and provider-session update atomically before reporting the turn as completed.

### Follow-up with the same agent

- When the selected agent has a synchronized provider session, send only the new prompt through its native resume command:
  - Codex: `codex exec resume --json <thread-id> <prompt>`;
  - Claude: `claude --print --verbose --output-format stream-json --resume <session-id> <prompt>`.
- Use an explicit id. Never use Codex `--last` or Claude `--continue`, because multiple MD² conversations may run concurrently.
- Keep the full MD² transcript even when native resume succeeds; provider persistence is an optimization, not the conversation record.

### Agent switching

- The run form allows selecting a different configured agent for any follow-up turn.
- Provider ids are not portable. When switching to an agent without a synchronized session, start a new provider session and include the full normalized MD² transcript as prior context.
- Pass transcript context through stdin, not as one large command-line argument. Keep the current user message as the prompt argument.
- The handoff contains ordered user/assistant messages, producing-agent identity, relevant tool results and failures. Exclude terminal control sequences, duplicated stream chunks, provider protocol envelopes, and hidden reasoning.
- Save the new provider id and synchronization cursor after the switched turn completes.
- When switching back to a provider with an older valid session, resume that session and include all transcript messages added since its synchronization cursor. Advance the cursor only after successful completion.

### Missing provider conversation

- If native resume reports that its conversation id does not exist or is no longer available, retry once as a new provider session with the full normalized transcript plus the current user prompt.
- Retry only for a provider-specific, structured missing-session result received before a new turn starts. Do not replay automatically after authentication, network, configuration, model, permission, tool, cancellation, or general process failures; those may already have caused side effects.
- Replace the unavailable provider-session record only after the fallback turn succeeds. Retain the failed id and error in conversation events for diagnosis.
- Conversations without any provider id, including older logs, use the same full-history start path.
- Do not silently truncate fallback history. If the provider rejects the full history because of input or context limits, show a clear error and keep the transcript unchanged.

### Command ownership

- Persisted desktop agent profiles remain the source of the configured command (`codex`, `claude`, or an explicit custom command/path).
- Provider adapters may add the documented model, thinking, search, structured-output, and resume arguments. They must not replace the configured executable by inspecting npm shims or resolving internal launcher targets.
- Execute Windows script commands through the platform shell while preserving prompt arguments and piped transcript input.
- Availability initialization validates the configured command. Process execution does not rediscover or rewrite it.

## Data flow

1. Append the user message to the in-memory MD² transcript.
2. Resolve the selected profile and its provider-session cursor.
3. Choose new-session, native-resume, switched-provider, or missing-id fallback invocation.
4. Start one structured subprocess and stream parsed events.
5. Append assistant output and terminal state to the transcript.
6. Persist the provider id/cursor and terminal transcript atomically to the owning activity file before publishing `closed`.
7. Exit the process. The next user message starts another process.

## Edge cases and failure modes

- Two turns for the same conversation must not run concurrently.
- Parallel MD² conversations must never share an implicit `last` session.
- A malformed JSONL event fails the turn visibly and remains in diagnostic events; do not treat it as assistant text.
- A provider may emit an id and then fail. Store the event, but do not mark its cursor synchronized through the failed user turn.
- Switching agents does not transfer provider-specific approvals, internal summaries, or hidden state. Only persisted MD² transcript context is portable.
- Session storage may disappear after application restart, cleanup, configuration-directory changes, or use on another machine. Missing-id fallback must cover these cases.
- Full-history handoff can be large. Preserve it and fail clearly on provider limits; transcript summarization is outside this feature.

## Compatibility and documentation impact

- No legacy path-derived conversation-log migration or fallback is provided; continuations read terminal conversations from activity files.
- This feature replaces live stdin semantics for non-streaming actions in F-010d, F-012, F-023, F-047, and the running-actions architecture note. F_75 adds a separate opt-in live-session contract; it does not change this one-shot contract.
- B-025's truncated transcript fallback is superseded by full normalized history and structured provider ids.
- Action chains and scheduled actions still await one agent turn and consume its final result. They do not gain follow-up UI.

## Testing implications

- Unit-test Codex and Claude new-session and resume command construction without executable rewriting.
- Test structured id extraction, full transcript persistence, cursor advancement, and atomic completion.
- Test same-agent follow-up sends only the new prompt with explicit id.
- Test Claude-to-Codex, Codex-to-Claude, and switch-back flows, including intervening-message handoff.
- Test missing-id fallback retries once with full history and replaces the active id only after success.
- Test that unrelated failures never trigger automatic replay.
- Test multiline prompts, quotes, shell characters, large stdin history, Windows `.cmd` commands, cancellation, malformed JSONL, and concurrent-conversation isolation.
- Update React tests so non-streaming conversation input starts a new turn, agent selection is available for follow-up, and input is disabled while a turn runs.

## Acceptance criteria

- For non-streaming actions, Codex and Claude run one structured process per conversation turn and exit after that turn.
- MD² persists the complete ordered transcript independently of provider session storage.
- Every successful provider session records its explicit id and transcript synchronization cursor.
- Same-agent follow-ups use native resume without resending synchronized history.
- Switching agents supplies full normalized history and stores the new provider id.
- Switching back supplies only transcript messages missing from that provider session.
- A confirmed missing provider id retries once using full history; other failures do not replay automatically.
- Configured agent commands remain authoritative and are never rewritten to internal npm launcher targets.
- Live structured output, cancellation, action history, and conversation recovery continue to work.
- App and desktop lint, typecheck, and tests pass.

## See also

- `design\feature_descriptions\ready\F_010d_agent_actions.md`
- `design\feature_descriptions\ready\F_012_agents.md`
- `design\feature_descriptions\ready\F_023_agent_streaming.md`
- `design\feature_descriptions\ready\F_047_running_actions_and_agents.md`
- `design\feature_descriptions\ready\B_006_agent_command_sources.md`
- `design\feature_descriptions\ready\B_025_agent_continue_without_context.md`
- `design\architecture\initial description\agents.md`
- `design\architecture\initial description\writings\running_actions.md`
- `design\feature_descriptions\F_75_agent_confirm_gate_in_one_shot_cli.md`
