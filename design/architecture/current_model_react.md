## React application data model

The React app owns the parsed domain model and runtime UI state. Its central aggregate is `DataServiceState`:

```text
DataServiceState
├─ project: ProjectReference | null
├─ snapshot: ProjectSnapshot | null
├─ runningAgents: RunningAgent[]
├─ hasPendingSave: boolean
└─ hasPendingPush: boolean
```

Defined in [data_service.ts](C:/Users/janbo/Documents/dev/md2/app/src/services/data/data_service.ts:24).

### Project domain model

```text
ProjectReference
├─ id
├─ branch
├─ owner? / repository?       GitHub mode
└─ rootPath?                  Electron mode

ProjectSnapshot
├─ activeCards: ProjectCard[]
├─ backgroundCards: ProjectCard[]
├─ repositoryFiles: string[]
└─ workingFolder: string

ProjectCard
├─ path: string               current repository-relative filepath
├─ content: string            complete Markdown source
├─ sha?: string               storage revision in GitHub mode
├─ isActive: boolean
├─ headerFields               raw frontmatter
├─ header: CardHeader
├─ agentConversations[]
└─ agentConversationErrors[]

CardHeader
├─ internalId                 intended stable internal card identity
├─ id                         user-facing ID, e.g. F-012
├─ title
├─ status
├─ after                      previous card's internalId
├─ affects: string[]          repository-relative filepaths
├─ agentLogReferences[]       repository-relative log paths
├─ policy
├─ worktree
├─ author / owner
└─ worktree state/error
```

These interfaces are defined in [data_types.ts](C:/Users/janbo/Documents/dev/md2/app/src/data/data_types.ts:46).

The active/background distinction is derived from file location:

- `activeCards` are directly inside the configured working folder.
- `backgroundCards` are other loaded Markdown files, including nested/history files.

### File-to-card transformation

```text
StorageService
      │
      ▼
MarkdownFile[]
{ content, path, sha? }
      │
      ▼
MarkdownParsingService
      │
      ├─ parse frontmatter → CardHeader
      ├─ preserve raw fields → headerFields
      ├─ derive isActive from filepath
      └─ preserve path/content/sha
      ▼
ProjectCard[]
      │
      ▼
ProjectState
      │
      ├─ activeCards
      ├─ backgroundCards
      └─ ProjectSnapshot
```

`MarkdownParsingService` creates cards in [markdown_parsing_service.ts](C:/Users/janbo/Documents/dev/md2/app/src/services/data/markdown_parsing_service.ts:353), while [project_state.ts](C:/Users/janbo/Documents/dev/md2/app/src/services/project/project_state.ts:112) owns the current parsed snapshot.

### Identity inside the card model

The model contains three candidate identifiers:

| Field | Meaning | Mutability |
|---|---|---|
| `header.internalId` | Internal card identity; also used by card ordering | Intended to be stable |
| `header.id` | User-facing card ID such as `F-012` | Domain-visible and potentially editable/imported |
| `path` | Current repository-relative file location | Changes when the file is renamed, moved, or archived |

Card ordering already uses `internalId`: the `after` field points to another card’s `internalId`, not its path. See [card_ordering.ts](C:/Users/janbo/Documents/dev/md2/app/src/data/card_ordering.ts:30).

Most UI and service lookups, however, use `path`.

## Other React-owned models

### Open files

```text
OpenFilesSnapshot
├─ paths: string[]
└─ activePath: string | null
```

This model treats paths as tab identities: [open_files_service.ts](C:/Users/janbo/Documents/dev/md2/app/src/services/open_files_service.ts:7).

### Workspace view

```text
WorkspaceViewSnapshot
├─ selectedPath: string | null
└─ viewMode: "cards" | "text"
```

This tracks navigation/highlighting separately from open tabs: [workspace_view_service.ts](C:/Users/janbo/Documents/dev/md2/app/src/services/project/workspace_view_service.ts:5).

### File tree

```text
TreeNode
├─ id                         filepath for file nodes
├─ path: string | null
├─ directoryPath
├─ kind
├─ label
└─ children[]
```

For file leaves, both `id` and `path` normally contain the filepath: [file_tree.ts](C:/Users/janbo/Documents/dev/md2/app/src/data/file_tree.ts:8).

### Actions

```text
ActionDefinition
├─ id                         stable execution identity
├─ sourcePath                 action JSON filepath
├─ type
├─ prompt / command
├─ appliesTo
├─ onBefore / on / onAfter    references other action IDs
└─ execution configuration

ActionContext
├─ kind
├─ file?                      card/file path
├─ folder?
├─ title?
├─ type?
├─ state?
└─ worktree?
```

Actions execute by `id`, but editing and drafts are keyed by `sourcePath`. Card/file execution is scoped using `context.file`: [action_context.ts](C:/Users/janbo/Documents/dev/md2/app/src/data/action_context.ts:17).

### Agent conversations

```text
AgentConversation
├─ id                         conversation identity
├─ path                       conversation-log filepath/reference
├─ cardPath                   associated card filepath
├─ actionId?
├─ messages[]
├─ events[]
├─ providerSessions[]
├─ status
└─ usage
```

A conversation therefore has a stable `id`, but its association with a card is path-based.

## Ownership overview

```text
DataService
├─ ProjectState              project, files and parsed card snapshot
├─ CardOperations           card/file mutations
├─ ProjectLoading           loading, watching and refresh
├─ AgentIntegration         conversations attached to cards
├─ ReleaseOperations        archive/release moves
└─ SaveStateService         pending-save state

Separate application services
├─ OpenFilesService         open paths and active path
├─ WorkspaceViewService     selected path and view mode
├─ ActionService            definitions and drafts by source path
├─ ActionExecutionService   live executions and path-based contexts
├─ WorktreeService          worktree records
└─ ConfigService            resolved application/project configuration
```

The resulting identity inconsistency is:

```text
Persisted card relationships → internalId
UI and editing state          → path
Agent/card association        → path
Action execution              → actionId + path-based context
Storage operations            → path
```

So React already has a stable internal card identity available, but much of its runtime model still treats the mutable filepath as the card/file identity.