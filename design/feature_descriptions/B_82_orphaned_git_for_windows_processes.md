---
author:
id: B_82
internalId: d97a054f-5a67-47bb-9070-df874cf9148e
title: agent runs leave orphaned Git for Windows processes
status: design
owner:
affects:
agents:
policy:
after:
---

## Problem

Agent runs launched through MD² can leave multiple `git.exe` processes running indefinitely. The processes appear as **Git for Windows** in Task Manager and accumulate across runs.

Observed processes were executing normally short-lived commands such as `config`, `rev-parse`, `remote -v`, and `status --porcelain`. They remained alive after their immediate parent processes had exited.

## Current implementation

MD² starts agents through `AgentRunnerService`. When an agent closes normally, `handleClose` queries the current Windows process tree and terminates descendants of the agent PID. Cancellation terminates the process tree with `taskkill /t /f`.

This cleanup cannot discover a surviving Git process after an intermediate parent has already exited: the current process snapshot no longer contains a complete chain from the agent PID to that Git process. The observed Git processes had dead immediate parents, matching this failure mode.

MD² also invokes Git directly through `git_commands.js`. These calls have no timeout or cancellation handling, so an independently hung app-owned Git command can block its caller indefinitely.

## Investigation plan

1. Reproduce with MD² open but no agent run, then while starting and completing or cancelling an agent run.
2. Record every spawned Git PID, command, working directory, parent PID, agent run ID, and lifecycle event.
3. Run an affected command under a bounded external timeout with Git tracing enabled to locate the blocking operation.
4. Check repository state, Git configuration, filesystem monitoring, antivirus or file locks, and agent shutdown ordering.
5. Confirm whether Git descendants become disconnected before `AgentRunnerService.handleClose` takes its process snapshot.

## Required change

- Track enough process ownership during an agent run to terminate surviving descendants even when intermediate processes exit before final cleanup.
- Clean up owned descendants when an agent completes, fails, is cancelled, or crashes.
- Do not terminate unrelated Git processes or Git work started outside the corresponding MD² agent run.
- Add a bounded timeout and process cleanup to direct Git execution in `git_commands.js`.
- Include the command, working directory, elapsed time, and owning run or app operation in timeout diagnostics.
- Deduplicate or serialize repeated read-only metadata probes only if tracing confirms they contribute to the accumulation.

## Failure modes and compatibility

- PID reuse must not allow cleanup to target a process that MD² did not start.
- Cleanup must cover shell and helper-process chains used by Git for Windows on Windows.
- Long-running network Git operations need an explicit, suitable timeout rather than the same threshold as local metadata commands.
- Existing agent cancellation, command actions, commits, worktree operations, push, pull, and fetch behavior must remain unchanged apart from bounded failure and cleanup.

## Acceptance criteria

- [ ] Completing, failing, cancelling, or crashing an agent run leaves no Git processes owned by that run.
- [ ] Repeated agent runs do not accumulate Git for Windows processes.
- [ ] Cleanup never terminates unrelated Git processes.
- [ ] A hung direct Git command times out, terminates its owned process tree, and reports an actionable error.
- [ ] Local metadata commands and network Git commands use appropriate timeout policies.
- [ ] Regression tests cover orphaned descendants, exited intermediate parents, cancellation, timeout, and unrelated-process protection.
- [ ] Existing desktop Git, worktree, action-runner, and process-tree tests pass.
