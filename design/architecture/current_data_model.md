The renderer widely uses paths as runtime identifiers. Electron itself does not have a `ProjectCard` model; it primarily exposes repository files and filesystem/Git operations. Cards are parsed and assembled in React.

## React components using paths as identity

I treated “identifier” as a path being stored in state, used as a map/set key, compared to locate an object, used as a React/DnD key, or passed to mutate a specific object. Display-only path usage is excluded.

| Area | Components/modules | How the path identifies data |
|---|---|---|
| Workspace selection | [project_workspace.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/project_workspace.tsx:80) | `selectedPath` identifies the selected card/file and coordinates navigation and deletion cleanup. |
| Board state | [card_view.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/card_view/card_view.tsx:110) | Stores `openBodyPath`, `openAffectsPath`, and `activeCardPath`; resolves them with `cards.find(card.path === path)`. |
| Board columns | [card_column.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/card_view/card_column.tsx:65) | Uses `card.path` as the React key and to decide which card is selected or open. |
| Individual card | [project_card_view.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/card_view/project_card_view.tsx:51) | Uses `card.path` as the DnD identifier, DOM identifier, execution lookup key, acknowledgement key, and mutation target. |
| Card popover | [card_body_popover.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/card_view/card_body_popover.tsx:56) | Associates dirty state, title drafts, running actions, deletion, and navigation with `card.path`. |
| Card body editor | [card_body_editor.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/card_view/card_body_editor.tsx:29) | Uses `card.path` as the edited-document target and editor React key. |
| Card operations | `CardDeleteDialog`, `CardPolicyMenuItem`, `CardWorktreeIndicator` | Carry a `cardPath` to identify the card on which to operate. |
| Affects editor | [affects_editor_dialog.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/card_view/affects_editor_dialog.tsx:41) | Uses the card path as the mutation target; affected repository files are themselves identified by paths. |
| Text workspace | [text_view.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/text_view/text_view.tsx:165) | Builds `cardsByPath`, `actionsByPath`, editor-document/path maps, and resolves the active object from `activePath`. |
| File tree | [file_tree_view.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/text_view/file_tree_view.tsx:40), [file_tree_node_row.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/text_view/file_tree_node_row.tsx:21) | File nodes have `id === path`; selection and `cardsByPath.get(path)` use that identity. |
| Tabs | [tab_bar.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/text_view/tab_bar.tsx:20), [use_open_tabs.ts](C:/Users/janbo/Documents/dev/md2/app/src/components/text_view/use_open_tabs.ts:15) | A tab’s identity and value are its path; `activePath` identifies the active object. |
| Search results | [search_results.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/shell/search/search_results.tsx:15) | Card/file results use `match.path` as React key and navigation target. |
| Action editor | [use_action_editor_controller.ts](C:/Users/janbo/Documents/dev/md2/app/src/components/actions/use_action_editor_controller.ts:26) | An action draft is keyed by its source JSON file’s `sourcePath`, despite the action also having a stable `id`. |
| Conversations | [action_conversation_picker.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/actions/action_conversation_picker.tsx:36), `ActionPopupContent`, `useActionPopupController` | Conversation log files are selected by `conversation.path`; conversations are associated with cards through `cardPath`. |
| Action status/usage | `useActionExecutions`, `ActionUsageSummary`, `usePendingFileSave` | Running executions, usage, and pending saves are queried by card/file path. |
| Diff viewer | [diff_view.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/actions/diff_view.tsx:111) | Diff file objects use `file.path` as their React key and editor target. |
| Remarkable import | [remarkable_import_panel.tsx](C:/Users/janbo/Documents/dev/md2/app/src/components/remarkable_import_panel.tsx:73) | Device files are selected by path; an existing target card is selected by `card.path`. |
| Folder/worktree configuration | `WorkingFolderChooserDialog`, `WorktreeConfigList` | Folder/worktree records are selected or keyed using their paths. |

The underlying tree model explicitly assigns file nodes `id: card.path`: [file_tree.ts](C:/Users/janbo/Documents/dev/md2/app/src/data/file_tree.ts:64).

## Electron data model

Electron’s model is repository/file-oriented:

```text
ProjectReference
├─ id: absolute repository root in local mode
├─ rootPath: absolute repository root
└─ branch

Repository
├─ md2.config.json
├─ Markdown files: { content, path }
├─ Action JSON files: { content, path }
├─ Assets: { content, contentType, encoding, path }
├─ Schedules
├─ Agent conversation logs
├─ Action history logs
└─ Worktree configuration
```

The important boundary is:

```text
Electron filesystem/Git
    → MarkdownFile[] { content, repoRelativePath }
    → preload/IPC bridge
    → React DataService
    → MarkdownParsingService
    → ProjectCard[] / ProjectSnapshot
```

`ProjectCard`, `ProjectSnapshot`, `MarkdownFile`, and the bridge contracts are defined in [data_types.ts](C:/Users/janbo/Documents/dev/md2/app/src/data/data_types.ts:46). Electron returns markdown files; React creates `ProjectCard` objects in [markdown_parsing_service.ts](C:/Users/janbo/Documents/dev/md2/app/src/services/data/markdown_parsing_service.ts:353).

Electron retains some transient state—current project, running executions, locks, schedules, watchers—but not the renderer’s complete card snapshot.

## How Electron uses file paths

Electron uses two distinct kinds of paths.

### Absolute filesystem paths

These include:

- `ProjectReference.rootPath`
- local-mode `ProjectReference.id`
- `WorktreeRecord.path`
- action `repositoryRoot`

The selected folder is resolved to the Git root, producing `{ branch, id: rootPath, rootPath }`: [git_commands.js](C:/Users/janbo/Documents/dev/md2/desktop/src/git/git_commands.js:83).

### Repository-relative paths

Examples:

```text
design/active/F-12-search.md
actions/review-code.json
design/logs/conversation__card__active_f_12_search__abc.json
```

Electron normalizes these to forward slashes. When reading a file, it calculates:

```text
relativePath = relative(repositoryRoot, absoluteFilePath)
```

When writing, it performs the reverse:

```text
absoluteFilePath = join(repositoryRoot, relativePath)
```

Every resolved target is checked to ensure it remains inside the repository root: [git_commands.js](C:/Users/janbo/Documents/dev/md2/desktop/src/git/git_commands.js:25).

Paths are then used for:

- Loading files and assets.
- Writing, deleting, staging, and committing files.
- Moving files through explicit `fromPath → toPath` requests.
- Emitting filesystem-watch events.
- Identifying action source JSON files.
- Scoping action contexts through `context.file`.
- Associating conversations through `cardPath`.
- Deriving conversation and action-history log filenames.
- Locking concurrent tracked actions per card path.
- Recording changed files and commit metadata.

A particularly important example is action locking: Electron constructs a `cardKey` from `rootPath + context.file`, so the card’s filepath becomes its concurrency identity: [action_worktree_execution_service.js](C:/Users/janbo/Documents/dev/md2/desktop/src/actions/action_worktree_execution_service.js:120).

Similarly, conversation continuation verifies:

```text
sourceConversation.cardPath === currentContext.file
```

And action-history filenames are derived from `context.file`: [log_paths.mjs](C:/Users/janbo/Documents/dev/md2/shared/log_paths.mjs:44).

## Overall conclusion

There are three identity approaches in the current model:

- Cards have potentially stable `header.internalId` and user-facing `header.id`.
- Actions use stable `action.id` for execution, but `sourcePath` for editing.
- UI selection, tabs, card operations, conversations, histories, and some Electron locks use mutable file paths.

Therefore, a card rename or move is not merely a storage-location change. Unless every stored path reference is migrated, it can affect open UI state, pending edits, execution association, conversation association, schedule context, action history location, and concurrency locking.