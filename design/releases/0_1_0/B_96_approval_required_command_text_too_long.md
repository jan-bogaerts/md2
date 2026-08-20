---
author: 
id: B_96
internalId: e9906c7f-d936-4c9a-ab73-2e7df0954024
title: approval required command text too long
status: ready
owner: 
affects:
agents:
  - design/releases/0_1_0/card__e9906c7f-d936-4c9a-ab73-2e7df0954024.json
policy:
after: 972b0cb8-3d8a-4935-9197-17ca3ad037ec
---

# Current state

`ActionAgentApproval` renders command approval text in full with wrapping. Long commands can consume most of the approval box and push security context and decision buttons away.

# Implementation details

- Show the command as a one-line, ellipsized preview by default. Keep other approval details unchanged.
- Make the command text a button that toggles between the preview and the exact full command. Expose expansion state with `aria-expanded` and preserve command formatting when expanded.
- Keep expansion state local to each pending approval. Add component tests for initial clipping, expand, and collapse behavior.

# Acceptance criteria

- A command approval initially shows at most one line of command text with overflow clipped.
- Clicking the command shows its complete, unchanged text; clicking again restores the one-line preview.
- Each approval expands independently, remains keyboard accessible, and keeps existing approval decisions and security details working.
