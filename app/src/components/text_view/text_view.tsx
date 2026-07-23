import { Box } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { defaultColumnAccent, type CardTypeConfig, type StateConfig } from '../../data/data_types'
import { LeftPanelSlot } from '../shell/left_panel_slot'
import { FileTreeView } from './file_tree_view'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { openFilesService, type OpenDocument } from '../../services/open_files_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { TextEditorPane } from './text_editor_pane'
import { useWorkingFolder } from '../hooks/use_working_folder'

const HISTORY_FOLDER_NAME = 'history'
interface TextViewProps {
    actionsFolder: string
    cardTypes: CardTypeConfig[]
    onLeftPanelInteraction: () => void
    projectFolder: string
    states: StateConfig[]
    visible: boolean
}

function openDocumentPath(document: OpenDocument) {
    return document.kind === 'card' ? document.getObject().path : document.getObject().sourcePath
}

function folderPath(parentFolder: string, childFolder: string) {
    return parentFolder.length > 0 ? `${parentFolder}/${childFolder}` : childFolder
}

function folderName(path: string): string {
    const name = path.replace(/\\/gu, '/').split('/').filter((part) => part.length > 0).at(-1)
    if (!name) throw new Error(`Cannot derive context type from folder path: ${path}`)

    return name
}

/** Text view: a folder/status tree plus tabbed, editable open files. */
export function TextView(props: TextViewProps) {
    const {
        actionsFolder,
        cardTypes,
        onLeftPanelInteraction,
        projectFolder,
        states,
        visible,
    } = props
    const workingFolder = useWorkingFolder()
    const onLeftPanelInteractionRef = useRef(onLeftPanelInteraction)

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
        onLeftPanelInteractionRef.current = onLeftPanelInteraction
    })

    const handleCreateFolder = useCallback(async (parentDirectory: string, name: string) => {
        try {
            await dataService.cards.createFolder(parentDirectory, name)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Folder creation failed: ${name}` })
            throw error
        }
    }, [])

    const handleCreateMarkdownFile = useCallback(async (parentDirectory: string, name: string) => {
        try {
            await dataService.cards.createMarkdownFile(parentDirectory, name)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Markdown file creation failed: ${name}` })
            throw error
        }
    }, [])

    const handleDeleteFile = useCallback(async (path: string) => {
        try {
            await dataService.cards.deleteFile(path)
            const document = openFilesService.getSnapshot().documents.find((candidate) => openDocumentPath(candidate) === path)
            if (document) openFilesService.closeDocument(document)
            workspaceViewService.clearSelectedPath(path)
            onLeftPanelInteractionRef.current()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `File delete failed: ${path}` })
            throw error
        }
    }, [])

    const handleDeleteFolder = useCallback(async (path: string) => {
        try {
            await dataService.cards.deleteFolder(path)
            const folderPrefix = `${path.replace(/\/+$/u, '')}/`
            const documents = openFilesService.getSnapshot().documents
            for (const document of documents) {
                const openPath = openDocumentPath(document)
                if (openPath?.startsWith(folderPrefix)) openFilesService.closeDocument(document)
            }
            const selectedPath = workspaceViewService.getSnapshot().selectedPath
            if (selectedPath?.startsWith(folderPrefix)) workspaceViewService.clearSelectedPath(selectedPath)
            onLeftPanelInteractionRef.current()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Folder delete failed: ${path}` })
            throw error
        }
    }, [])

    return (
        <>
            {visible ? <LeftPanelSlot>
                <Box
                    aria-label="File tree"
                    sx={{ bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
                >
                    <FileTreeView
                        actionsFolder={actionsFolder}
                        cardTypes={cardTypes}
                        onCreateFolder={handleCreateFolder}
                        onCreateMarkdownFile={handleCreateMarkdownFile}
                        onDeleteFile={handleDeleteFile}
                        onDeleteFolder={handleDeleteFolder}
                        onLeftPanelInteraction={onLeftPanelInteraction}
                        projectFolder={projectFolder}
                        statusColors={statusColors}
                        workingFolder={workingFolder}
                    />
                </Box>
            </LeftPanelSlot> : null}
            <Box hidden={!visible} sx={{ display: visible ? 'flex' : 'none', flex: 1, minHeight: 0 }}>
                <TextEditorPane
                    actionsFolder={actionsFolder}
                    cardTypes={cardTypes}
                    specialContextTypes={specialContextTypes}
                    states={actionStates}
                    statusColors={statusColors}
                    visible={visible}
                />
            </Box>
        </>
    )
}
