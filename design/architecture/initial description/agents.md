---
internalId: bb104396-7624-4d53-9a74-28e8ff697a36
---

# Agents

- Agent processes only run through Electron. Agent actions choose one-shot or streaming execution.
- One-shot is the default:
  - each user turn runs in a separate structured subprocess;
  - Codex uses `exec --json`; Claude uses `--print --verbose --output-format stream-json`;
  - stdin closes after initial input and additional conversation input is disabled while the turn runs;
  - a follow-up starts another process and appends to the same log.
- Streaming is opt-in with `streaming: true` on agent actions:
  - one provider process stays alive across user turns until explicit Finish or Cancel;
  - Codex uses `app-server --stdio`; Claude uses `--print --verbose --output-format stream-json --input-format stream-json`;
  - stdin stays open, and the UI can send or steer turns and answer structured questions;
  - provider turn completion moves the action to `waitingForInput` without completing the action;
  - Finish closes the provider session and resumes action-chain completion; Cancel terminates the action;
  - streaming is allowed only for interactive manual runs and supported profiles.
- Agent outputs are stored in JSON conversation logs referenced by Markdown files. Each log is the complete ordered MD² transcript.
- User and assistant messages are separate from provider protocol events. Assistant messages record their producing agent.
- Provider-session records store agent name, explicit provider conversation id, synchronization cursor, and timestamps.
- While a turn runs:
  - parsed events and assistant output stream into the execution UI and log;
  - one-shot cancellation terminates only that turn and does not advance its provider cursor.
- Streaming transcripts and provider ids persist at every turn boundary and terminal transition.
- A synchronized provider resumes through its explicit id. Switching providers sends normalized missing transcript context through stdin.
- Missing provider sessions retry once with full history only after a structured missing-session result received before turn activity.
- Cards, editor surfaces, and run forms use the same persisted conversation and execution event stream.
- Project close, app quit, or unexpected streaming-process exit terminates the live session; unexpected exit before Finish fails the action.

## See also

- `design\feature_descriptions\F_023_agent_streaming.md`
- `design\feature_descriptions\F_050_one_shot_agent_conversations.md`
- `design\feature_descriptions\F_75_agent_confirm_gate_in_one_shot_cli.md`
