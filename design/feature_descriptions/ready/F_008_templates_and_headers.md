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
New cards are created through `DataService.createCard` and `createCardFile`. File naming uses the configured card type prefix and next available number, and generated markdown now goes through `markdownParsingService.buildCardMarkdown`. The generated header includes `id`, `internalId`, `title`, `status: new` and `affects`, followed by a title heading and the body entered in the new-card form. There is no configured body template yet, and new-card generation still does not write `author`, `owner` or `policy`.

Markdown parsing and serialization now live in `app/src/services/markdown_parsing_service.ts` ([[F-021]]). `DataService` uses it to split active/background cards, parse loaded files, replace card bodies while preserving headers, rewrite header fields, toggle policy flags and refresh snapshots after saves. `CardHeader` currently contains `id`, `internalId`, `title`, `status`, `owner`, `affects`, `after` and `policy`; it does not contain `author`. Generic parsing can read scalar, list and nested-map frontmatter fields, while card parsing imports files outside the `{id}-{title}.md` convention as status `new` and falls back to body/title data when headers are missing or malformed.

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
