import { Box, Button, Divider, Stack, Typography } from '@mui/material'
import { useEffect, useState, type MouseEvent } from 'react'
import type { DiffFile, WorktreeDiffResult } from '../../data/electron_action_bridge'
import { cardCommitLabel, loadCardBodyDiff, type CardBodyDiff, type CardCommit } from '../../services/actions/card_commit_history'
import { markdownParsingService } from '../../services/data/markdown_parsing_service'
import { dialogService } from '../../services/dialog_service'
import { worktreeService } from '../../services/project/worktree_service'
import type { DiffCommitReference } from '../../services/data/diff_service'
import { DiffView } from '../actions/conversation/diff_view'
import { MarkdownEditor } from '../editor/markdown_editor'
import type { CardMarkdownDataSource } from '../editor/card_markdown_data_source'
import type { MarkdownBindingKind } from '../editor/markdown_data_source'
import { useActiveCard } from '../hooks/use_active_card'

export type CardDiffSelection =
    | { commit: CardCommit, kind: 'commit' }
    | { kind: 'worktree' }

interface CardCommitDiffPanelProps {
    binding: Exclude<MarkdownBindingKind, 'list-action'>
    dataSource?: CardMarkdownDataSource
    onExit: () => void
    selection: CardDiffSelection
}

interface LoadedWorktreeDiff {
    bodyDiff: CardBodyDiff | null
    cardFile: DiffFile | null
    result: WorktreeDiffResult
}

interface KeyedValue<Value> {
    key: string
    value: Value
}

function ignoreReadOnlyChange() {
    // Diff editor is read-only and intentionally disconnected from persistence.
}

function diffReference(commit: CardCommit): DiffCommitReference {
    return {
        branch: commit.branch,
        commit: commit.commit,
        filePaths: commit.filePaths,
    }
}

function worktreeBodyDiff(file: DiffFile): CardBodyDiff {
    const oldExists = file.changeType !== 'added'
    const newExists = file.changeType !== 'deleted'

    return {
        newBody: newExists ? markdownParsingService.parse(file.newValue).body : '',
        newExists,
        oldBody: oldExists ? markdownParsingService.parse(file.oldValue).body : '',
        oldExists,
    }
}

function normalizeWorktreeDiff(result: WorktreeDiffResult, cardPath: string): LoadedWorktreeDiff {
    const cardFile = result.files.find((file) => file.path === cardPath || file.oldPath === cardPath) ?? null

    return { bodyDiff: cardFile ? worktreeBodyDiff(cardFile) : null, cardFile, result }
}

function changedFileLabel(file: DiffFile) {
    return file.changeType === 'renamed' && file.oldPath ? `${file.oldPath} — ${file.path}` : file.path
}

/** Read-only card body diff plus navigation to every other changed file. */
export function CardCommitDiffPanel(props: CardCommitDiffPanelProps) {
    const { binding, dataSource, onExit, selection } = props
    const commit = selection.kind === 'commit' ? selection.commit : null
    const isWorktree = selection.kind === 'worktree'
    const card = useActiveCard(binding, dataSource)
    const cardPath = card?.path ?? null
    const historicalTouchesCurrentPath = !!cardPath && !!commit?.filePaths.includes(cardPath)
    const loadKey = `${isWorktree ? 'worktree' : commit?.commit ?? 'missing'}:${cardPath ?? 'missing'}`
    const [bodyDiffState, setBodyDiffState] = useState<KeyedValue<CardBodyDiff> | null>(null)
    const [errorState, setErrorState] = useState<KeyedValue<Error> | null>(null)
    const [worktreeDiffState, setWorktreeDiffState] = useState<KeyedValue<LoadedWorktreeDiff> | null>(null)
    const [selectedOtherPathState, setSelectedOtherPathState] = useState<KeyedValue<string> | null>(null)
    const bodyDiff = bodyDiffState?.key === loadKey ? bodyDiffState.value : null
    const error = errorState?.key === loadKey ? errorState.value : null
    const loadedWorktreeDiff = worktreeDiffState?.key === loadKey ? worktreeDiffState.value : null
    const selectedOtherPath = selectedOtherPathState?.key === loadKey ? selectedOtherPathState.value : null
    const selectOtherPath = (event: MouseEvent<HTMLButtonElement>) => {
        try {
            const { path } = event.currentTarget.dataset
            if (!path) throw new Error('Cannot select an empty changed-file path')
            setSelectedOtherPathState({ key: loadKey, value: path })
        } catch (caught) {
            dialogService.error(caught, { fallbackMessage: 'Changed file could not be selected' })
        }
    }

    useEffect(() => {
        let active = true
        if (!cardPath) return () => { active = false }

        if (isWorktree) {
            void worktreeService.generateCardWorktreeDiff(cardPath).then((result) => {
                if (active) setWorktreeDiffState({ key: loadKey, value: normalizeWorktreeDiff(result, cardPath) })
            }).catch((loadError: unknown) => {
                if (!active) return
                const nextError = loadError instanceof Error ? loadError : new Error('Could not load worktree diff')
                setErrorState({ key: loadKey, value: nextError })
                dialogService.error(nextError, { fallbackMessage: 'Could not load worktree diff' })
            })

            return () => { active = false }
        }

        if (!commit || commit.available === false || !historicalTouchesCurrentPath) return () => { active = false }
        void loadCardBodyDiff(commit, cardPath).then((nextDiff) => {
            if (active) setBodyDiffState({ key: loadKey, value: nextDiff })
        }).catch((loadError: unknown) => {
            if (active) {
                const nextError = loadError instanceof Error ? loadError : new Error('Could not load card body diff')
                setErrorState({ key: loadKey, value: nextError })
            }
        })

        return () => { active = false }
    }, [cardPath, commit, historicalTouchesCurrentPath, isWorktree, loadKey])

    if (!cardPath) return null

    const worktreeCardFile = loadedWorktreeDiff?.cardFile ?? null
    const touchesCurrentPath = isWorktree ? !!worktreeCardFile : historicalTouchesCurrentPath
    const displayedBodyDiff = isWorktree ? loadedWorktreeDiff?.bodyDiff ?? null : bodyDiff
    const hasBodyChanges = !!displayedBodyDiff && displayedBodyDiff.oldBody !== displayedBodyDiff.newBody
    const displayError = commit?.available === false
        ? new Error('Commit is no longer available in this repository')
        : error
    const historicalOtherPaths = commit?.filePaths.filter((filePath) => filePath !== cardPath) ?? []
    const worktreeOtherFiles = loadedWorktreeDiff?.result.files.filter((file) => file !== worktreeCardFile) ?? []
    const otherFileCount = isWorktree ? worktreeOtherFiles.length : historicalOtherPaths.length
    const loading = !displayError && (isWorktree ? !loadedWorktreeDiff : touchesCurrentPath && !displayedBodyDiff)

    return (
        <Box aria-label={isWorktree ? 'Card worktree diff' : 'Card commit diff'} role="region" sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
            <Box sx={{ alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, p: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2">{isWorktree ? 'Current worktree changes' : cardCommitLabel(commit!.record)}</Typography>
                    <Typography color="text.secondary" variant="caption">
                        {isWorktree ? 'Current repository state' : `${new Date(commit!.committedAt).toLocaleString()} · ${commit!.commit.slice(0, 7)}`}
                    </Typography>
                </Box>
                <Button onClick={onExit} size="small" variant="outlined">Exit diff</Button>
            </Box>
            {displayError ? <Typography color="error" role="alert" sx={{ p: 2 }}>{displayError.message}</Typography> : null}
            {loading ? <Typography sx={{ p: 2 }}>Loading diff…</Typography> : null}
            {touchesCurrentPath && displayedBodyDiff && !hasBodyChanges ? (
                <Typography color="text.secondary" sx={{ p: 2 }}>No body changes in this {isWorktree ? 'worktree' : 'commit'}</Typography>
            ) : null}
            {touchesCurrentPath && displayedBodyDiff && hasBodyChanges ? (
                <MarkdownEditor
                    diffMarkdown={displayedBodyDiff.oldBody}
                    hideToolbar
                    key={commit?.commit ?? 'current-worktree'}
                    markdown={displayedBodyDiff.newBody}
                    onChange={ignoreReadOnlyChange}
                    readOnly
                    viewMode="diff"
                />
            ) : null}
            {!loading ? <Divider /> : null}
            {!loading ? (
                <Stack spacing={0.5} sx={{ p: 1.5 }}>
                    <Typography variant="subtitle2">Also changed ({otherFileCount})</Typography>
                    {isWorktree ? worktreeOtherFiles.map((file) => (
                        <Button data-path={file.path} key={`${file.oldPath ?? ''}:${file.path}`} onClick={selectOtherPath} sx={{ justifyContent: 'flex-start' }} variant="text">
                            {changedFileLabel(file)}
                        </Button>
                    )) : historicalOtherPaths.map((filePath) => (
                        <Button data-path={filePath} key={filePath} onClick={selectOtherPath} sx={{ justifyContent: 'flex-start' }} variant="text">
                            {filePath}
                        </Button>
                    ))}
                    {otherFileCount === 0 ? <Typography color="text.secondary" variant="body2">No other files changed.</Typography> : null}
                </Stack>
            ) : null}
            {selectedOtherPath && commit ? (
                <Box sx={{ p: 1.5 }}>
                    <DiffView commitReference={diffReference(commit)} initialPath={selectedOtherPath} />
                </Box>
            ) : null}
            {selectedOtherPath && loadedWorktreeDiff ? (
                <Box sx={{ p: 1.5 }}>
                    <DiffView initialPath={selectedOtherPath} label="Worktree diff" result={loadedWorktreeDiff.result} />
                </Box>
            ) : null}
        </Box>
    )
}
