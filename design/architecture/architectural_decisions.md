# Architectural decisions

Project-wide decisions for MD². The app is a Vite React web app in `app/`; `desktop/` is a separate Electron host that can load the website and expose local capabilities through preload bridges.

## File naming

| Decision | Rule | Rationale |
| --- | --- | --- |
| Code files use lowercase snake_case names. | All code files in `app/src/` and `desktop/` use lowercase words separated by underscores, for example `github_auth_service.ts`, `project_workspace.tsx`, and `local_git_service.js`. Test files keep the same base name with `.test` before the extension, for example `github_auth_service.test.ts`. Exported symbols keep normal TypeScript/JavaScript casing such as `GithubAuthService`, `ProjectWorkspace`, and `useGithubAuth`. | A single file naming convention avoids mixed PascalCase, camelCase, and hyphenated filenames, and keeps imports predictable across Windows and case-sensitive environments. |

## Services and state

| Decision | Rule | Rationale |
| --- | --- | --- |
| Global singleton services own domain state and logic. | Each domain is a class in `src/services/**`, instantiated once at module level and exported, for example `export const indexesService = new IndexesService()`. React components do not own domain state. | Keeps business logic out of components, testable without a DOM, and shared across windows/views without Redux, Zustand, or Context stores. |
| Service location follows usage scope. | If a service is specific to one UI element and used only there, place it beside that component. Generic or shared services, such as logging, database access, config, storage, or cross-screen domain logic, belong in `src/services/`. | Keeps component-owned behavior local while preserving `src/services/` for reusable application services. |
| Consumers use direct imports or the service injector. | Direct import when no import cycle exists; use `src/services/service_injector.js` when a cycle would occur. Every global singleton service registers itself in its constructor with `inj.register('myService', this)`. | The service graph is dense; the injector is a bare global registry that defers resolution to call time. |
| Services have a two-phase lifecycle. | Constructors only register and set unloaded state such as `null`. Config-dependent or service-dependent work runs in `init()`, `start()`, app bootstrap (`App.jsx`), or a `loaded` lifecycle event. `configService.config` is private; callers use `get`, `set`, and `clear`. | Module evaluation order is not guaranteed, so `configService` is not usable at import time. Reading config in a constructor is a bug. |


## Events and React integration

| Decision | Rule | Rationale |
| --- | --- | --- |
| Services notify observers through their own `EventTarget`. | Services expose an `EventTarget` and dispatch named `CustomEvent` domain events such as `activeIndex`, `added`, `deleted`, or `changedBox`. Observers subscribe with `addEventListener` and unsubscribe with `removeEventListener` on the owning service. | Decouples producers from consumers without depending on Node `EventEmitter`, which is not available in the browser-first React app. |
| Custom hooks bridge service events to functional components. | Hooks in `src/components/hooks/`, such as `useActiveIndex` and `useProjectConfig`, seed `useState` from a service property, subscribe in `useEffect`, unsubscribe in cleanup, and return the value. Prefer hook + service over prop chains. | Components stay declarative and avoid direct event plumbing. |
| Components use the app theme service path. | `App` owns theme mode through `useThemeMode()`, builds the MUI theme with `createAppTheme(mode)`, and provides it through `ThemeProvider`. Components read theme values with MUI APIs such as `useTheme`, `useMediaQuery`, and `sx`; only controls that change the palette mode receive `mode` and `onToggleTheme`. | Theme state, persistence, and palette construction stay centralized while components remain presentation-focused. |
