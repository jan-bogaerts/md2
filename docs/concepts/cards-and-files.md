# Cards and files

A card is a Markdown file. Nothing else. Open the repository in any editor and you see the same content md² shows you.

## Anatomy of a card file

```markdown
---
id: F_12
internalId: 8424e672-1dc0-4839-a59b-9decca2720dd
title: Show augmentation restrictions in image info
status: design
author: jan
owner: jan
after: 294fcb4d-cab3-43b7-94d8-c5625aad98a3
affects:
  - app/src/components/card_view/card_view.tsx
policy:
  needsReview: true
  breaking: false
---

# Goal

...
```

The block between the `---` lines is the header (frontmatter). The rest is the body, which is what you edit in the Markdown editor.

## Header fields

| Field | Meaning |
| --- | --- |
| `id` | Human-readable card id, for example `F_12`. Generated from the card type prefix and the next free number. When missing, it is read back from the file name. |
| `internalId` | Generated UUID. Never change it — links between cards use this value. |
| `title` | Card title, shown on the card and in the tree. When missing, the first `# ` heading in the body is used. |
| `status` | Board column the card sits in. Should be one of the configured columns. |
| `author` / `owner` | Free text. |
| `after` | `internalId` of the card that comes before this one in its column. This is how ordering survives in Git without renumbering every file. |
| `affects` | List of repository files the card touches. Edited through the **Affects** dialog, which suggests files as you type. |
| `policy` | Named booleans shown as toggles in the card menu. Use them for flags like "needs review". |
| `agents` | References to conversation logs recorded for this card. Managed by md². |
| `worktree` | One-based index of the linked worktree assigned to this card. See [Worktrees](../guide/worktrees.md). |

Unknown header fields are preserved when md² rewrites the file, so you can add your own.

## File names

Card files are named `{prefix}{separator}{number}{separator}{title-slug}.md`, for example `F_12_show_augmentation_restrictions.md`.

- The prefix comes from the card type (`F`, `J`, `B` by default).
- The number is the next free one across the project folder and its subfolders.
- The separator is `_` by default and configurable per project (`_` or `-`). Existing files keep the separator they were created with.
- Renaming a card's title renames the file, keeping the id and number.

## Card types

Card types are project configuration. Each type has a `type`, `label`, `idPrefix`, and `color`. The color is the vertical bar on the left of the card.

Defaults:

| Type | Prefix | Color |
| --- | --- | --- |
| Feature | `F` | blue |
| Job | `J` | purple |
| Bug | `B` | red |

Add or change types in the config dialog, section **Project**.

## Ordering

Column order is stored in the `after` field, not in a separate index file. Dragging a card rewrites at most a few files instead of the whole column, which keeps diffs and merges small.

## New cards

New cards get the configured **card body template** inserted before whatever body you type. The default template is:

```markdown
# Goal

# Current status

# Details

# Tasks
```

## Files that are not cards

Any other Markdown file in the project is a plain document — architecture notes, specs, anything. They show up in the tree, open in the same editor, and are searchable, but they have no board presence.

Markdown files that appear in the root of the working folder without following the card naming convention are treated as cards entered by something else and imported with status `new`. A header is filled in for them.

See also: [Project layout](project-layout.md), [Board view](../guide/board-view.md).
