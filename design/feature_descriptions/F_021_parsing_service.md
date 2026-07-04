---
id: F-021
title: parsing service
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

# Parsing service

## Goal
Markdown parsing and markdown serialization belong in one shared application service. Components, storage services and feature-specific helpers must not parse frontmatter, split headers from bodies, rewrite header fields or rebuild markdown files independently.

## Current state
- Markdown files are loaded by storage services as raw `{ path, sha, content }` objects.
- `DataService` currently turns loaded files into cards through `splitProjectCards`.
- Header parsing, naming-convention checks and card conversion currently live in `app/src/data/markdown_headers.ts`.
- Card creation currently builds markdown content in the card naming path.

## Design
- Add a shared parsing service in `app/src/services/markdown_parsing_service.ts`, exported as the singleton `markdownParsingService`.
- The service owns:
  - full markdown file parsing into `{ header, body, rawHeader }`;
  - card conversion from `MarkdownFile` to `ProjectCard`;
  - active/background card splitting for a working folder;
  - header field parsing for `author`, `id`, `internalId`, `title`, `status`, `owner`, `affects`, `after` and `policy`;
  - body-only replacement while preserving the existing header;
  - header field rewrites while preserving unrelated header fields and body;
  - markdown generation for new cards from a header object and body template.
- `DataService` is the main consumer. It asks the parsing service to parse loaded files, refresh snapshots after saves and build new card content.
- Storage services stay format-agnostic. They read and write raw files only.
- React components never inspect frontmatter syntax directly. They work with `ProjectCard`, `CardHeader`, markdown body text and explicit save/update operations.

## Edge cases
- Files without frontmatter remain valid imports; title and id fallback behavior stays in the parsing service.
- Malformed or unclosed frontmatter is treated as body content and must not drop user text.
- Empty files, header-only files and body-only edits must preserve line endings as consistently as practical.
- Missing required fields for newly generated cards fail fast. Imported files may use documented fallback values.
- `internalId` is generated once for new cards and preserved by all rewrite operations.

## Testing
- Unit tests cover header parsing, malformed headers, body replacement, header rewrites, new card generation, active/background splitting and non-convention imports.
- Feature tests that edit card bodies or header fields should assert behavior through the parsing service rather than duplicating frontmatter expectations in components.
