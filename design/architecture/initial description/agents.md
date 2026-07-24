---
internalId: bb104396-7624-4d53-9a74-28e8ff697a36
---

# Agents

- Agent processes only run through Electron, one structured subprocess per user turn.
- Codex uses `exec --json`; Claude uses `--print --verbose --output-format stream-json`.
- Agent outputs are stored in JSON conversation logs referenced by Markdown files. Each log is the complete ordered MD² transcript.
- User and assistant messages are separate from provider protocol events. Assistant messages record their producing agent.
- Provider-session records store agent name, explicit provider conversation id, synchronization cursor, and timestamps.
- While a turn runs:
  - parsed events and assistant output stream into the execution UI and log;
  - additional conversation input is disabled;
  - cancellation terminates only that turn and does not advance its provider cursor.
- A follow-up starts another process and appends to the same log.
- A synchronized provider resumes through its explicit id. Switching providers sends normalized missing transcript context through stdin.
- Missing provider sessions retry once with full history only after a structured missing-session result received before turn activity.
- Cards, editor surfaces, and run forms use the same persisted conversation and execution event stream.
