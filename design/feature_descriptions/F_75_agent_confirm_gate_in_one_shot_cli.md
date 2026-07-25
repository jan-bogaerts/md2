---
internalId: efff6fd1-ee29-4b18-a397-d49f85ef1bc4
---

# F_75: Agent confirm gate skipped in one-shot CLI

## Problem

Agent prompt says: make plan, implement after confirm, then write `ready` to file. Agent only implements.

## Cause

One-shot is problem.

`claude -p` = single non-interactive turn. No human turn exist. Agent cannot ask "confirm?" then wait — nobody answer. Model see this, skip plan+confirm, jump to implement. Confirm gate need two turns minimum.

## Fixes, pick one

### 1. Split into two runs (cleanest)

- Run A: `claude -p "plan only, write PLAN.md, do NOT edit code"`
- human/script read PLAN.md, approve
- Run B: `claude -p --resume <session-id> "approved, implement, write ready when done"`

`--resume` keep context, so no re-derive.

### 2. Drop confirm, keep artifacts

Prompt: "write PLAN.md, then implement it, then write ready". No gate. One-shot fine. Confirm become post-hoc review of PLAN.md.

### 3. Auto-approve gate

If confirm is ceremony not real gate, remove it from prompt. Model waste tokens on dead branch.

## Also: missing `ready` file

Put `ready` write as last hard requirement, and check exit reason. If run hit max turns limit, agent die before write. Bump `--max-turns`.
