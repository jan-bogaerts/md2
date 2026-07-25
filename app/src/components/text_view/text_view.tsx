import { Box } from '@mui/material'
import { useEffect, useMemo, useRef } from 'react'
import { defaultColumnAccent, type CardTypeConfig, type StateConfig } from '../../data/data_types'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { useWorkingFolder } from '../hooks/use_working_folder'
import { TextEditorPane } from './text_editor_pane'

const HISTORY_FOLDER_NAME = 'history'

interface TextViewProps {
    actionsFolder: string
    cardTypes: CardTypeConfig[]
    projectFolder: string
    states: StateConfig[]
}

function folderPath(parentFolder: string, childFolder: string) {
    return parentFolder.length > 0 ? `${parentFolder}/${childFolder}` : childFolder
}

function folderName(path: string): string {
    const name = path.replace(/\\/gu, '/').split('/').filter((part) => part.length > 0).at(-1)
    if (!name) throw new Error(`Cannot derive context type from folder path: ${path}`)

    return name
}

/** Lifetime-stable text editor surface, hidden directly when card view is active. */
export function TextView(props: TextViewProps) {
    const { actionsFolder, cardTypes, projectFolder, states } = props
    const workingFolder = useWorkingFolder()
    const rootElementRef = useRef<HTMLDivElement>(null)
    const specialFolderPaths = useMemo(
        () => [actionsFolder, workingFolder, folderPath(projectFolder, HISTORY_FOLDER_NAME)],
        [actionsFolder, projectFolder, workingFolder],
    )
    const specialContextTypes = useMemo(() => specialFolderPaths.map(folderName), [specialFolderPaths])
    const actionStates = useMemo(() => states.map(({ state }) => state), [states])
    const statusColors = useMemo(() => new Map(
        states.map(({ color, state }, index) => [state, color ?? defaultColumnAccent(index)]),
    ), [states])

    useEffect(() => {
        const updateVisibility = () => {
            const rootElement = rootElementRef.current
            if (!rootElement) throw new Error('Missing text view root element')

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
