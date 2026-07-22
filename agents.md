# Agent Instructions

You should always only do what is instructed, never just do something because you think this is part of the task. if you believe something is missing in the task, say so, don't just do it.
ex: instruction is to split up feature descriptions, nothing is mentioned about changing feature status, then don't change it.

## folder structure
- app: react-front end
- desktop: electron desktop-host / backend app

## system info
- we are running on windows
- the shell is Windows PowerShell 5.x, not PowerShell 7 (`pwsh`)
- do not use bash-style or PowerShell 7 command chaining such as `&&` or `||`
- coreutils like ls cat,... are available
- when multiple commands are needed, run them as separate shell/tool calls
- if a single PowerShell command must include multiple statements, use native PowerShell syntax and prefer separate lines or `;` only when necessary
- for git workflows, prefer one command per tool call, for example `git add ...`, then `git commit ...`, then `git status`


## operation principles for work on design documents
Before writing or modifying a design document, **analyze the codebase first**. Review relevant modules, data flow, interfaces, configuration, and dependencies. Do not rely on assumptions or partial understanding.

You must identify:
- current implementation and architecture
- all components affected by the change
- required code modifications
- edge cases and failure modes
- compatibility and side effects
- testing implications

Do **not** start writing implementation details until the system behavior is understood.

Keep analysis and documentation **short, precise, and to the point**. Avoid verbosity, repetition, or speculation.


## Impact analysis before edits
- Before changing a shared helper, utility, or service method, list all call sites and state whether each should keep old behavior or receive the new behavior.
- Do not add compatibility flags, fallback branches, or mode parameters unless at least two verified call sites need different behavior.
- Prefer direct, single-purpose changes when the inspected call graph shows only one behavior is required.

## Linting
As an agent working on this codebase, you must:
1. **Follow all linting rules** defined in each subproject's `eslint.config.js`.
2. **Do not override or ignore** linting rules unless explicitly instructed.
3. **Run the linter** locally before submitting or committing code:
```powershell
npm run lint
```
4. Fix all linting errors and warnings before submitting a pull request.
5.  Use auto-fix   
```powershell
npm run lint-fix
```


## Architecture decision docs
- follow the architectural decisions described in `design\architecture\architectural_decisions.md`
- Do not edit `design/architecture/architectural_decisions.md` unless the user explicitly asks to update architectural decisions.
- When adding a new architecture note, create or update the specific architecture markdown file only, and link it from related feature docs.
- If a change seems to belong in `architectural_decisions.md`, ask first.

## code style guide
- Put every **component or class** in it's **own file**.
- Add a short **JSDoc** to new functions when useful.
- **avoid functions nested** inside other functions when writing new functions.
- no abbreviations for variable names (common abreviations like i or idx are ok).
- no inline code for react event handlers, use a constant instead
- Use async/await for all asynchronous operations; avoid .then().
- stick to the given task, don't change code that is not related to the task.
- Prefer const; only use let when reassignment is required.
- Prefer `!!x` over `Boolean(x)` for boolean coercion.
- Prefer array helpers like `find`, `some`, `map`, and `filter` for simple single-purpose collection queries or transforms. Use `for...of` loops when control flow is more complex, needs early continue guards, or spans multiple steps.
- Destructure objects from loop variables (const { category, observation } = meta).
- Use nullish coalescing (??) instead of || when zero is a valid value.
- Missing required fields, variables, constructor state, config values, or domain payload data must fail fast with a clear error instead of silently falling back to defaults.
- Do not add backward compatibility fallbacks or legacy shape support unless explicitly requested.
- `||`, `??`, optional chaining, default parameters, and `try/catch` are allowed when they express intentional control flow; do not use them to hide missing required data.
- Build objects in a single line when possible (boxes.push({ box, obs, category, timestamp })).
- Name domain payload objects before passing them to function calls, ex:
 ```javascript
 (const keypointData = { keyPoints, timestamp }; 
 addBackend(category, observation, keypointData)).
 ```
- Compute shared values once per iteration (e.g., const time = …).
- Accumulate items in arrays first, then call batched DB operations once per array.
- Check array length (> 0) before performing DB writes.
- Keep object field order consistent and avoid multi-step mutations.
- Prefer instance methods for logic used by a single class and tightly coupled to that class workflow. Use module-level functions only for reusable pure helpers shared across files or classes. If the logic is class-scoped but does not use instance state, use a static method.
- Do not introduce instance methods that only forward to a static method or helper just to route through `this` or `this.constructor`.
- If logic does not use instance state, prefer a module-level function by default.
- Use a static method only when the logic is clearly class-scoped and the class already has meaningful instance behavior or multiple related methods.
- Do not create a service class when it would only expose one short static/helper method. Export a plain function from the module instead.
- Before adding a new service class, verify that it owns state, lifecycle, injected dependencies, or multiple related operations. If it does not, keep it as a function.
- For single-condition `if` statements whose body is only `return`, omit braces.
- when working on react components, take a look at other related components for formatting and layout styles and recurring patterns.
- “Extract” means move behavior and ownership, not just markup.
  - if a new component receives more than 5-7 behavior props, reconsider the split.
  - If most handlers still live in the parent, the extraction is incomplete.
  - The extracted component should be testable mostly on its own. 
- Do not extract trivial one-line predicates or conversions into named helpers unless:
  - they are used widely enough to remove meaningful duplication, or
  - the name captures non-obvious domain semantics that the inline code would hide poorly.
- Verify actual field types before normalizing. Do not add coercion defensively. Only normalize when the inspected code path shows mixed types are real, and prefer doing it at the input boundary rather than at arbitrary comparison sites.
- avoid magic numbers, use named constants instead
- use ; at end of statements
- avoid multiple inheritance

## react component style guide
- dialogs have buttons in the bottom right corner
- use the `dialogService` to show errors, warnings,...
- for styling, read and use this guide: `design\STYLE_GUIDE.md`
- application states belong in services, not in components.
- Root components own layout; leaf components bind to changing application data. Place subscriptions in the smallest component that renders their value.


## Testing

### Agent Responsibilities

you must:

1. **Do not break existing tests.** If a test fails after your change, either:

   - Fix the code if the test remains correct, or
   - Update the test and explain why if behavior intentionally changed.
2. **Add tests** for:

   - New public functions or utilities.
   - New React components or significant UI states.
   - Bug fixes (a regression test that would fail before the fix).
3. **Run the test suite** before submitting changes:

   ```powershell
   npm run test
   ```

   Run the command in each affected subproject, for example `app/` and/or `desktop/`.

### Test Conventions

- **Location / Naming**

  - Place tests close to the code they test
- **Structure**

  - Use `describe` blocks to group related tests by component or function.
  - Use clear, descriptive `it` / `test` names that describe behavior, not implementation.
- **Style**

  - Follow the same **code style guide** as production code (no unnecessary nesting, use `const`, clear variable names, etc.).
  - Use **async/await** in tests for async behavior; avoid `.then()`.

### Test / Code Conflicts

- When a test fails after your changes, assume your changes caused it and may also have broken related app behavior. Fix the code first. 
- Fix pre-existing failures.
- Treat tests as signals, not automatic source of truth.
- If an existing test conflicts with current implementation, naming, comments, docs, or the user request, do **not** immediately change code to satisfy the test.
  - First determine whether the test may be stale or whether the code may be wrong.
- If the correct behavior is not clearly established from the current task or nearby code, ask the user a single concise clarifying question before changing either the code or the test.
- Do not broaden a task by "fixing" unrelated behavior only because an older test expects it.
- When a test failure reveals behavior outside the requested change, prefer pausing for confirmation over making compatibility changes.
- When updating a test to match intended behavior, briefly state why the test was considered stale.
- Never change the requirements cause the test is failing: fix the test or make a note, but stick to the requirements. Example: `The failing test exposed that MUI’s chip delete icon is not accessible by label in this version. I’m replacing it with an explicit Remove … button so removal is user-centric and testable.` this is not allowed. fix the test instead.

### React Testing Guidelines

- Prefer **user-centric tests** using React Testing Library:

  - Use queries like `getByRole`, `getByText`, `getByLabelText`, etc.
  - Avoid testing implementation details such as internal state or private functions.
- Use `@testing-library/jest-dom` matchers, for example:

  - `expect(element).toBeInTheDocument()`
  - `expect(button).toBeDisabled()`
  - `expect(message).toHaveTextContent('...')`
- For user interactions, use `userEvent` (if configured) instead of calling event handlers directly.
