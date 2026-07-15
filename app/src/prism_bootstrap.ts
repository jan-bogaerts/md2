// prismjs core is CommonJS, so the bundler defers executing it behind a lazy
// require wrapper, while the `prismjs/components/prism-*` files pulled in by
// @lexical/code run at the top level of the chunk and read the global `Prism`.
// Without this module the wrapper only runs after the components, crashing the
// built app with "ReferenceError: Prism is not defined" (see F-045). Importing
// the core here, as the app's first module, publishes the global before any
// language component evaluates.
import Prism from 'prismjs'

;(globalThis as typeof globalThis & { Prism?: typeof Prism }).Prism = Prism
