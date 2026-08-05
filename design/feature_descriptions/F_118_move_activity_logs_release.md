---
internalId: a729f80c-de80-4c12-9b53-bf0fbf29e4cb
id: F_118
status: design
title: move activity logs release
after: 
agents:
  - design/activity/card__a729f80c-de80-4c12-9b53-bf0fbf29e4cb.json#conversation=agent-c823bba5-38e7-4d1b-be37-204e74e28dd3
---
Move the activity logs together with the cards that are moved to the release folder. this way, the 'activity' folder doesn't get to overcrowded.

I believe the only file that references the log is the card itself. this will probably have to be updated so that it points to the correct location (same folder)

## Current state

- Release completion moves final-state cards and their unshared image assets in one `moveFiles` commit. Card content is unchanged.
- Card activity uses one JSON file per `internalId` under `<projectFolder>/activity`. Every `agents` frontmatter entry stores its repository-relative file path plus conversation ID.
- Conversation loaders follow that stored path, so they can load a log outside the central activity folder. Activity creation still always targets the central folder.
- Released cards remain searchable and their conversations load. Agent controls currently also allow new runs and conversation continuation on released cards.

## implementation details

- During release planning, derive each released card's activity filename from its `internalId`. When that file exists, load it and add one move from the central activity folder to the release folder beside the card. Leave `project.json` and logs for other cards unchanged.
- Rewrite every moved card's `agents` reference to the repository-relative release path, preserving conversation IDs and order. Include rewritten card content, activity logs, and assets in the existing atomic release move commit.
- Deduplicate activity moves when one card has several conversation references. Fail before `moveFiles` on malformed references, an unexpected activity path, missing referenced log, load failure, or target collision.
- Treat cards inside the configured releases folder as historical. Keep conversation viewing, but disable and reject new, continued, and restarted agent runs. Show concise guidance to create a new card for more work. Archived cards keep current behavior.
- Add release-planning, storage-path, conversation-loading, and agent-run guard tests. Run app and desktop lint/tests.

## acceptance criteria

- Completing a release moves each released card's existing activity JSON beside that card and removes it from the central activity folder in the same commit.
- Every released card reference resolves to its moved log; all conversations and history still load after project refresh.
- Cards without activity add no log move. Unreleased card logs and project activity remain in `<projectFolder>/activity`.
- Multiple conversations in one card log produce one file move and retain all frontmatter references.
- Any invalid or incomplete activity move aborts release without partial card, asset, log, or reference changes.
- Released cards expose read-only conversation history. New, continue, and restart agent actions are unavailable and rejected with guidance to create a new card.
