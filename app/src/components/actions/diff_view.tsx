import { Box, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import DiffViewer from 'react-diff-viewer-continued'
import type { ActionRunHistoryEntry, DiffFile, DiffResult, OpenInEditorRequest } from '../../data/electron_action_bridge'
import { dialogService } from '../../services/dialog_service'
import { generateDiff as defaultGenerateDiff, openDiffLine as defaultOpenDiffLine } from '../../services/diff_service'
import { resolveClickedLine } from './diff_line_mapping'

type GenerateDiff = (entry: ActionRunHistoryEntry) => Promise<DiffResult>
type OpenDiffLine = (request: OpenInEditorRequest) => Promise<void>

interface DiffViewProps {
    entry: ActionRunHistoryEntry
    generateDiff?: GenerateDiff
    openDiffLine?: OpenDiffLine
}

interface DiffFileViewProps {
    file: DiffFile
    onOpenLine: (request: OpenInEditorRequest) => void
}

function DiffFileView(props: DiffFileViewProps) {
    const { file, onOpenLine } = props

    const handleLineNumberClick = (lineId: string) => {
        const request = resolveClickedLine(file, lineId)
        if (request) onOpenLine(request)
    }

    return (
        <Box sx={{ mt: 1 }}>
            <Typography sx={{ fontFamily: 'monospace' }} variant="caption">
                {file.path}
            </Typography>
            <DiffViewer
                disableWorker
                leftTitle={file.path}
                newValue={file.newValue}
                oldValue={file.oldValue}
                onLineNumberClick={handleLineNumberClick}
                splitView
            />
        </Box>
    )
}

/**
 * Diff view for an action log entry that carries commit metadata. Loads normalized diff data
 * through the configured Electron command and opens VS Code when a changed line is clicked.
 */
export function DiffView(props: DiffViewProps) {
    const { entry } = props
    const generateDiff = props.generateDiff ?? defaultGenerateDiff
    const openDiffLine = props.openDiffLine ?? defaultOpenDiffLine
    const [result, setResult] = useState<DiffResult | null>(null)
    const [isUnavailable, setIsUnavailable] = useState(false)

    useEffect(() => {
        let isActive = true

        async function loadDiff() {
            setIsUnavailable(false)
            setResult(null)
            try {
                const diff = await generateDiff(entry)
                if (isActive) setResult(diff)
            } catch (loadError) {
                if (isActive) {
                    setIsUnavailable(true)
                    dialogService.error(loadError, { fallbackMessage: 'Could not load diff' })
                }
            }
        }

        void loadDiff()

        return () => {
            isActive = false
        }
    }, [entry, generateDiff])

    const handleOpenLine = async (request: OpenInEditorRequest) => {
        try {
            await openDiffLine(request)
        } catch (openError) {
            dialogService.error(openError, { fallbackMessage: 'Could not open VS Code' })
        }
    }

    if (isUnavailable) {
        return (
            <Typography color="text.secondary" variant="caption">
                Diff unavailable.
            </Typography>
        )
    }

    if (!result) {
        return (
            <Typography color="text.secondary" variant="caption">
                Loading diff…
            </Typography>
        )
    }

    return (
        <Box role="region" aria-label="Commit diff">
            {result.files.map((file) => (
                <DiffFileView file={file} key={file.path} onOpenLine={handleOpenLine} />
            ))}
        </Box>
    )
}
