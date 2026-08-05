import { Box, Typography } from '@mui/material'
import { useEffect, useRef, useState, type Ref } from 'react'
import DiffViewer from 'react-diff-viewer-continued'
import type { DiffFile, DiffResult, OpenInEditorRequest } from '../../../data/electron_action_bridge'
import { dialogService } from '../../../services/dialog_service'
import {
    generateDiff as defaultGenerateDiff,
    openDiffLine as defaultOpenDiffLine,
    type DiffCommitReference,
} from '../../../services/data/diff_service'
import { resolveClickedLine } from './diff_line_mapping'

type GenerateDiff = (commitReference: DiffCommitReference) => Promise<DiffResult>
type OpenDiffLine = (request: OpenInEditorRequest) => Promise<void>

interface DiffViewProps {
    commitReference: DiffCommitReference
    generateDiff?: GenerateDiff
    initialPath?: string
    openDiffLine?: OpenDiffLine
}

interface DiffFileViewProps {
    containerRef?: Ref<HTMLDivElement>
    file: DiffFile
    onOpenLine: (request: OpenInEditorRequest) => void
}

function DiffFileView(props: DiffFileViewProps) {
    const { containerRef, file, onOpenLine } = props

    const handleLineNumberClick = (lineId: string) => {
        const request = resolveClickedLine(file, lineId)
        if (request) onOpenLine(request)
    }

    return (
        <Box ref={containerRef} sx={{ mt: 1 }}>
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
    const { commitReference, initialPath } = props
    const generateDiff = props.generateDiff ?? defaultGenerateDiff
    const openDiffLine = props.openDiffLine ?? defaultOpenDiffLine
    const [result, setResult] = useState<DiffResult | null>(null)
    const [isUnavailable, setIsUnavailable] = useState(false)
    const initialFileRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (result && initialPath) initialFileRef.current?.scrollIntoView({ block: 'start' })
    }, [initialPath, result])

    useEffect(() => {
        let isActive = true

        async function loadDiff() {
            setIsUnavailable(false)
            setResult(null)
            try {
                const diff = await generateDiff(commitReference)
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
    }, [commitReference, generateDiff])

    const handleOpenLine = async (request: OpenInEditorRequest) => {
        try {
            if (!result?.repositoryRoot) throw new Error('Diff result is missing execution repository root')
            await openDiffLine({ ...request, repositoryRoot: result.repositoryRoot })
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
                <DiffFileView
                    containerRef={file.path === initialPath ? initialFileRef : undefined}
                    file={file}
                    key={file.path}
                    onOpenLine={handleOpenLine}
                />
            ))}
        </Box>
    )
}
