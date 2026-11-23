import { Box, Button, Typography } from '@mui/material'
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { cardCommitLabel, type CardCommit } from '../../services/actions/card_commit_history'
import { DiffViewModeControl } from '../actions/conversation/events/diff_view_mode_control'
import type { CardMarkdownDataSource } from '../editor/data_sources/card_markdown_data_source'
import type { MarkdownBindingKind } from '../editor/data_sources/markdown_data_source'
import { useActiveCard } from '../hooks/use_active_card'
import { CommitDiffWorkspaceSource } from './diff_workspace/commit_diff_workspace_source'
import { DiffWorkspace } from './diff_workspace/diff_workspace'
import { DiffWorkspaceSearchButton } from './diff_workspace/diff_workspace_search_button'
import { DiffWorkspaceSearchService } from './diff_workspace/diff_workspace_search_service'
import { DiffWorkspaceService } from './diff_workspace/diff_workspace_service'
import type { DiffWorkspaceSource } from './diff_workspace/diff_workspace_types'
import { WorktreeDiffWorkspaceSource } from './diff_workspace/worktree_diff_workspace_source'

export type CardDiffSelection =
    | { commit: CardCommit, kind: 'commit' }
    | { kind: 'worktree' }

interface CardCommitDiffPanelProps {
    binding: Exclude<MarkdownBindingKind, 'list-action'>
    dataSource?: CardMarkdownDataSource
    onExit: () => void
    selection: CardDiffSelection
}

const UNAVAILABLE_COMMIT_MESSAGE = 'Commit is no longer available in this repository'

function createWorkspaceSource(cardPath: string | null, commit: CardCommit | null): DiffWorkspaceSource | null {
    if (!cardPath) return null
    if (!commit) return new WorktreeDiffWorkspaceSource(cardPath)
    if (commit.available === false) return null

    return new CommitDiffWorkspaceSource(commit, cardPath)
}

/** Fixed diff header plus a tabbed workspace that loads the changed-file list first and each file on demand. */
export function CardCommitDiffPanel(props: CardCommitDiffPanelProps) {
    const { binding, dataSource, onExit, selection } = props
    const commit = selection.kind === 'commit' ? selection.commit : null
    const isWorktree = selection.kind === 'worktree'
    const card = useActiveCard(binding, dataSource)
    const cardPath = card?.path ?? null
    const [workspace] = useState(() => new DiffWorkspaceService())
    const [search] = useState(() => new DiffWorkspaceSearchService())
    const source = useMemo(() => createWorkspaceSource(cardPath, commit), [cardPath, commit])
    const sourceKey = source?.key ?? null

    useEffect(() => {
        if (source) workspace.setSource(source)
    }, [source, workspace])

    useEffect(() => {
        search.reset()
    }, [search, sourceKey])

    useEffect(() => () => {
        workspace.reset()
        search.reset()
    }, [search, workspace])

    if (!cardPath) return null

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        search.handleKeyDown(event)
    }

    return (
        <Box
            aria-label={isWorktree ? 'Card worktree diff' : 'Card commit diff'}
            onKeyDown={handleKeyDown}
            role="region"
            sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}
        >
            <Box sx={{ alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', flexShrink: 0, gap: 1, p: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2">{isWorktree ? 'Current worktree changes' : cardCommitLabel(commit!.record)}</Typography>
                    <Typography color="text.secondary" variant="caption">
                        {isWorktree ? 'Current repository state' : `${new Date(commit!.committedAt).toLocaleString()} · ${commit!.commit.slice(0, 7)}`}
                    </Typography>
                </Box>
                <DiffWorkspaceSearchButton service={search} />
                <DiffViewModeControl />
                <Button onClick={onExit} size="small" variant="outlined">Exit diff</Button>
            </Box>
            {commit?.available === false ? (
                <Typography color="error" role="alert" sx={{ p: 2 }}>{UNAVAILABLE_COMMIT_MESSAGE}</Typography>
            ) : (
                <DiffWorkspace search={search} sourceKind={isWorktree ? 'worktree' : 'commit'} workspace={workspace} />
            )}
        </Box>
    )
}
