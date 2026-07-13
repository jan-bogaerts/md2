# Class relationships

Current project class usage is concentrated in the React app. The Electron host exposes bridge functions but does not currently define classes.

```mermaid
classDiagram
    direction LR

    class EventTarget {
        <<browser API>>
    }

    class StorageService {
        <<interface>>
        checkoutBranch(project, branch)
        commit(request)
        createProject(project, workingFolder)
        listBranches(project)
        loadProject(project, workingFolder)
        push(project)
        watchProject(project, onChange)
    }

    class DataService {
        +init(dependencies)
        +getState()
        +createProject(project)
        +openProject(project)
        +switchBranch(branch)
        +createCard(draft)
        +saveFile(file)
        +flushPendingCommits()
        +push()
    }

    class CommitBatcher {
        +schedule(branch, files, message)
        +flush()
    }

    class LocalGitStorageService {
        +init(dependencies)
        +openProjectFolder()
        +createProject(project, workingFolder)
        +loadProject(project, workingFolder)
        +listBranches(project)
        +checkoutBranch(project, branch)
        +commit(request)
        +push(project)
        +watchProject(project, onChange)
    }

    class GithubStorageService {
        +init(dependencies)
        +createProject(project, workingFolder)
        +loadProject(project, workingFolder)
        +listBranches(project)
        +checkoutBranch(project, branch)
        +commit(request)
        +push()
        +findRepository(owner, repository)
    }

    class GithubAuthService {
        +init(dependencies)
        +getAccessToken()
        +getSnapshot()
        +isInitialized()
        +restoreSession()
        +login()
        +logout()
        +handleUnauthorized()
    }

    class GithubUnauthorizedError {
        <<error>>
    }

    EventTarget <|-- DataService
    EventTarget <|-- GithubAuthService
    StorageService <|.. LocalGitStorageService
    StorageService <|.. GithubStorageService
    DataService *-- CommitBatcher : owns
    DataService o-- StorageService : persists through
    GithubAuthService ..> GithubUnauthorizedError : handles
    GithubStorageService ..> StorageService : implements
    LocalGitStorageService ..> StorageService : implements
```

## Notes

- `DataService` is the project state owner. It creates and owns `CommitBatcher` during `init()`.
- `DataService` persists project changes through the `StorageService` interface, allowing local Git and GitHub-backed implementations.
- `GithubAuthService` is separate from storage. It validates and persists a GitHub personal access token (PAT — the only supported auth method; OAuth/device-flow was removed 2026-07-11) and dispatches auth snapshots through `EventTarget`.
- `GithubUnauthorizedError` is raised by the GitHub user API client and handled by `GithubAuthService`.

