# Search

The search box sits in the title bar and is always available.

## What is searched

| Group | Default | With options |
| --- | --- | --- |
| Active cards | Header fields and full body | — |
| Background cards (releases, archive, subfolders) | Header fields only | Full body, with **Search background file bodies** |
| Action definitions | Not searched | Label, description, and prompt text, with **Search actions** |

Background cards are loaded after the board, so a large history costs nothing at startup and is still searchable once loaded.

## Options

Open the dropdown next to the input for the toggles:

| Toggle | Effect |
| --- | --- |
| **RegExp mode** | Treat the query as a regular expression instead of a plain substring. An invalid expression is reported rather than silently matching nothing. |
| **Search background file bodies** | Include the bodies of background cards. |
| **Search actions** | Include action definitions in the results. |
| **Ask agent to build a RegExp** | Turn a description like "cards mentioning a TODO from last year" into a regular expression. Needs an agent backend. |

Plain-text search is case-insensitive. RegExp search is not, unless your expression says so.

## Results

Results are grouped: active cards first, then background matches grouped by folder, then actions. Each hit shows the field it matched (`body` or a header field name) with surrounding context.

Selecting a result:

- a card or file opens it in the current view;
- an action opens the action popup in board view, or the action editor tab in list view.

See also: [Board view](board-view.md), [List view](text-view.md).
