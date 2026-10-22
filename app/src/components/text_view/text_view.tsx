import { Box } from '@mui/material'
import { useEffect, useMemo, useRef } from 'react'
import {
    DEFAULT_ARCHIVED_FOLDER,
    DEFAULT_RELEASES_FOLDER,
    defaultColumnAccent,
    type CardTypeConfig,
    type StateConfig,
} from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { useWorkingFolder } from '../hooks/use_working_folder'
import { TextEditorPane } from './text_editor_pane'

interface TextViewProps {
    actionsFolder: string
    archivedFolder?: string
    cardTypes: CardTypeConfig[]
    projectFolder: string
    releasesFolder?: string
    states: StateConfig[]
}

function folderPath(parentFolder: string, childFolder: string) {
    return parentFolder.length > 0 ? `${parentFolder}/${childFolder}` : childFolder
}

function folderName(path: string): string | null {
    const name = path.replace(/\\/gu, '/').split('/').filter((part) => part.length > 0).at(-1)

    return name ?? null
}

/** Lifetime-stable text editor surface, hidden directly when card view is active. */
export function TextView(props: TextViewProps) {
    const {
        actionsFolder,
        archivedFolder = folderPath(props.projectFolder, DEFAULT_ARCHIVED_FOLDER),
        cardTypes,
        releasesFolder = folderPath(props.projectFolder, DEFAULT_RELEASES_FOLDER),
        states,
    } = props
    const workingFolder = useWorkingFolder()
    const rootElementRef = useRef<HTMLDivElement>(null)
    const missingRootReportedRef = useRef(false)
    const specialFolderPaths = useMemo(
        () => [actionsFolder, workingFolder, releasesFolder, archivedFolder],
        [actionsFolder, archivedFolder, releasesFolder, workingFolder],
    )
    const specialContextTypes = useMemo(
        () => specialFolderPaths.map(folderName).filter((name): name is string => name !== null),
        [specialFolderPaths],
    )
    const invalidFolderPath = specialFolderPaths.find((path) => folderName(path) === null) ?? null
    const actionStates = useMemo(() => states.map(({ state }) => state), [states])
    const statusColors = useMemo(() => new Map(
        states.map(({ color, state }, index) => [state, color ?? defaultColumnAccent(index)]),
    ), [states])

    useEffect(() => {
        if (invalidFolderPath !== null) {
            dialogService.error(`Cannot derive context type from folder path: ${invalidFolderPath}`)
        }
    }, [invalidFolderPath])

    useEffect(() => {
        const updateVisibility = () => {
            const rootElement = rootElementRef.current
            if (!rootElement) {
                if (!missingRootReportedRef.current) {
                    missingRootReportedRef.current = true
                    dialogService.error(new Error('Missing text view root element'), {fallbackMessage: 'Text view could not be displayed'})
                }
                return
            }

            rootElement.style.display = workspaceViewService.getSnapshot().viewMode === 'text' ? 'flex' : 'none'
        }

        updateVisibility()
        workspaceViewService.addEventListener('changed', updateVisibility)

        return () => workspaceViewService.removeEventListener('changed', updateVisibility)
    }, [])

    return (
        <Box ref={rootElementRef} sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <TextEditorPane
                actionsFolder={actionsFolder}
                cardTypes={cardTypes}
                specialContextTypes={specialContextTypes}
                states={actionStates}
                statusColors={statusColors}
            />
        </Box>
    )
}
