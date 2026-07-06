---
id: B-011
title: every edit rewrites CRLF files as LF
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`splitHeader` in `app/src/services/markdown_parsing_service.ts` normalizes the whole content to `\n` when a header is present, and all rewrite operations (`replaceBody`, `rewriteHeader`, `setPolicyFlag`, `setAgentLogReferences`) rebuild the file with `\n` joins. Any edit to a CRLF file converts it entirely to LF, producing whole-file diffs in the git repositories the app manages. F-021 asks to "preserve line endings as consistently as practical".

## Fix
- Detect the dominant line ending of the original content once (first `\r\n` occurrence → CRLF) in the parsing service.
- Rewrite operations join with the detected ending and re-emit the body with its original endings (only parse-time normalization stays internal).
- New files keep using `\n` (unchanged).

## acceptance criteria
- Editing the body or a header field of a CRLF file changes only the edited lines in the resulting diff.
- LF files remain LF; mixed files pick the dominant ending deterministically.
- Parsing behavior (header field extraction, card splitting) is unchanged.
- Tests cover CRLF body replacement, header rewrite and policy toggle round-trips.

## see also
- `design\feature_descriptions\F_021_parsing_service.md`
