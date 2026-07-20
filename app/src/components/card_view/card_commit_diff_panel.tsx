import { Box, Button, Divider, Stack, Typography } from '@mui/material'
import { useEffect, useState, type MouseEvent } from 'react'
import type { CommitReference } from '../../data/electron_action_bridge'
import { loadCardBodyDiff, type CardBodyDiff, type CardCommit } from '../../services/actions/card_commit_history'
import { DiffView } from '../actions/diff_view'
import { MarkdownEditor } from '../editor/markdown_editor'

interface CardCommitDiffPanelProps {
    cardPath: string
    commit: CardCommit
    onExit: () => void
}

function ignoreHistoricalChange() {
    // Historical editor is read-only and intentionally disconnected from persistence.
}

function diffReference(commit: CardCommit): CommitReference {
    return {
        actionId: commit.actionId ?? commit.record.rootActionId,
        actionName: commit.actionName ?? commit.record.rootActionLabel,
        branch: commit.branch,
        commit: commit.commit,
        committedAt: commit.committedAt,
        deletions: commit.deletions,
        filePaths: commit.filePaths,
        filesChanged: commit.filesChanged,
        insertions: commit.insertions,
        repositoryRoot: '',
    }
}

/** Read-only body diff plus navigation to other files changed by one card commit. */
export function CardCommitDiffPanel(props: CardCommitDiffPanelProps) {
    const { cardPath, commit, onExit } = props
    const touchesCurrentPath = commit.filePaths.includes(cardPath)
    const otherPaths = commit.filePaths.filter((path) => path !== cardPath)
    const [bodyDiff, setBodyDiff] = useState<CardBodyDiff | null>(null)
    const [error, setError] = useState<Error | null>(null)
    const [selectedOtherPath, setSelectedOtherPath] = useState<string | null>(null)
    const selectOtherPath = (event: MouseEvent<HTMLButtonElement>) => {
        const { path } = event.currentTarget.dataset
        if (!path) throw new Error('Cannot select an empty changed-file path')
        setSelectedOtherPath(path)
    }

    useEffect(() => {
        let active = true
        if (!touchesCurrentPath) return () => { active = false }
        void loadCardBodyDiff(commit, cardPath).then((nextDiff) => {
            if (active) setBodyDiff(nextDiff)
        }).catch((loadError: unknown) => {
            if (active) setError(loadError instanceof Error ? loadError : new Error('Could not load card body diff'))
        })

        return () => { active = false }
    }, [cardPath, commit, touchesCurrentPath])

    const hasBodyChanges = !!bodyDiff && bodyDiff.oldBody !== bodyDiff.newBody

    return (
        <Box aria-label="Card commit diff" role="region" sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
            <Box sx={{ alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, p: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2">{commit.record.rootActionLabel}</Typography>
                    <Typography color="text.secondary" variant="caption">
                        {new Date(commit.committedAt).toLocaleString()} · {commit.commit.slice(0, 7)}
                    </Typography>
                </Box>
                <Button onClick={onExit} size="small" variant="outlined">Exit diff</Button>
            </Box>
            {error ? <Typography color="error" role="alert" sx={{ p: 2 }}>{error.message}</Typography> : null}
            {touchesCurrentPath && !error && !bodyDiff ? <Typography sx={{ p: 2 }}>Loading diff…</Typography> : null}
            {touchesCurrentPath && bodyDiff && !hasBodyChanges ? (
                <Typography color="text.secondary" sx={{ p: 2 }}>No body changes in this commit</Typography>
            ) : null}
            {touchesCurrentPath && bodyDiff && hasBodyChanges ? (
                <MarkdownEditor
                    diffMarkdown={bodyDiff.oldBody}
                    hideToolbar
                    key={commit.commit}
                    markdown={bodyDiff.newBody}
                    onChange={ignoreHistoricalChange}
                    readOnly
                    viewMode="diff"
                />
            ) : null}
            <Divider />
            <Stack spacing={0.5} sx={{ p: 1.5 }}>
                <Typography variant="subtitle2">Also changed ({otherPaths.length})</Typography>
                {otherPaths.map((path) => (
                    <Button data-path={path} key={path} onClick={selectOtherPath} sx={{ justifyContent: 'flex-start' }} variant="text">
                        {path}
                    </Button>
                ))}
                {otherPaths.length === 0 ? <Typography color="text.secondary" variant="body2">No other files changed.</Typography> : null}
            </Stack>
            {selectedOtherPath ? (
                <Box sx={{ p: 1.5 }}>
                    <DiffView commitReference={diffReference(commit)} initialPath={selectedOtherPath} />
                </Box>
            ) : null}
        </Box>
    )
}
