import type { Card } from '../../../../data/data_types';

/** Invalid assignments still reserve a card and must not enter a shared-checkout sequence. */
export function isSequenceCardAssigned({ header }: Card): boolean {
    return !!header.worktreeValue || header.worktree !== null && header.worktree !== undefined || !!header.worktreeError;
}
