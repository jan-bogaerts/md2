---
id: F-008
title: templates and headers
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Apply a template when a new markdown file is created and automatically add the specially formatted header (`author`, `id`, `internalId`, `title`, `status`, `owner`, `affects`, `policy`); import files that don't follow the naming convention as new features.

## Current state
New cards are created through `DataService.createCard` and `createCardFile`. The generated markdown already includes frontmatter with `id`, `title`, `status: new` and `affects`, plus a title heading and body, but it does not include `author`, `internalId`, `owner` or `policy`. Markdown parsing currently lives in `markdown_headers.ts`; it parses optional frontmatter and imports files outside the `{id}-{title}.md` convention as status `new`. This should move behind the shared parsing service so header parsing, full-file parsing, body replacement, header rewrites and new-file generation use one implementation.

## implementation details
- Extend `CardHeader` and the shared parsing service to parse the full supported header: `author`, `id`, `internalId`, `title`, `status`, `owner`, `affects` and `policy`.
- Keep headers optional for imported/external files; files without naming convention remain imported as new feature cards.
- Replace the hardcoded card markdown builder with parsing-service markdown generation used by new card creation.
- Generate `internalId` once when a card is created and preserve it on later edits.
- Keep id generation and file naming in `card_naming.ts`: use the configured card type prefix and next available number across working folder and subfolders.
- Keep project workspace template creation separate: missing working folders still get the README workspace template.

## acceptance criteria
- Creating a new card writes a markdown file named `{id}-{title}.md` in the configured working folder.
- The new file contains the configured body template and a frontmatter header with `author`, `id`, `internalId`, `title`, `status`, `owner`, `affects` and `policy`.
- `internalId` is generated once per new card and is not derived from the filename or display id.
- Loading existing markdown parses the supported header fields into `CardHeader` through the shared parsing service.
- Loading markdown without a header still creates a card from body/title fallback data.
- Loading root markdown files that do not follow the naming convention imports them as new feature cards.
- Tests cover parsing-service header parsing, full-header card creation, generated `internalId`, and import behavior for non-convention files.

## see also
- `design\architecture\initial description\overview.md`
- `design\architecture\initial description\data management.md`
- `design\architecture\parsing_service.md`
