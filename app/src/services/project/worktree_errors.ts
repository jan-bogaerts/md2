/** Expected rejection when user selects primary project folder as linked worktree. */
export class PrimaryWorktreeSelectionError extends Error {
    constructor() {
        super('Primary project folder is already the primary worktree. Choose a different folder for the linked worktree.')
        this.name = 'PrimaryWorktreeSelectionError'
    }
}
