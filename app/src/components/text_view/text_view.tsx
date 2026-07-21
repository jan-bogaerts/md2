import { Box } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { buildFileTree } from '../../data/file_tree'
import type { ActionDefinition } from '../../data/action_types'
import { defaultColumnAccent, type CardTypeConfig, type ProjectCard, type StateConfig } from '../../data/data_types'
import { actionService } from '../../services/actions/action_service'
import { LeftPanelSlot } from '../shell/left_panel_slot'
import { FileTreeView } from './file_tree_view'
import { useActions } from '../hooks/use_actions'
import type { OpenDocumentObject } from '../../services/open_files_service'
import { TextEditorPane } from './text_editor_pane'

const HISTORY_FOLDER_NAME = 'history'
const LOGS_FOLDER_NAME = 'logs'
interface TextViewProps {
    actionsFolder: string
    activeCards: ProjectCard[]
    backgroundCards: ProjectCard[]
    cardTypes: CardTypeConfig[]
    onLeftPanelInteraction: () => void
    onCreateFolder: (parentDirectory: string, name: string) => Promise<void>
    onCreateMarkdownFile: (parentDirectory: string, name: string) => Promise<void>
    onDeleteFile: (path: string) => Promise<void>
    onDeleteFolder: (path: string) => Promise<void>
    projectFolder: string
    projectKey: string
    repositoryFiles: string[]
    states: StateConfig[]
    workingFolder: string
    visible: boolean
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
        activeCards,
        backgroundCards,
        cardTypes,
        onLeftPanelInteraction,
        onCreateFolder,
        onCreateMarkdownFile,
        onDeleteFile,
        onDeleteFolder,
        projectFolder,
        projectKey,
        repositoryFiles,
        states,
        workingFolder,
        visible,
    } = props
    const { actions } = useActions()
    const onDeleteFileRef = useRef(onDeleteFile)
    const onDeleteFolderRef = useRef(onDeleteFolder)
    const onLeftPanelInteractionRef = useRef(onLeftPanelInteraction)

    const specialFolderPaths = useMemo(
        () => [actionsFolder, workingFolder, folderPath(projectFolder, HISTORY_FOLDER_NAME)],
        [actionsFolder, projectFolder, workingFolder],
    )
    const specialContextTypes = useMemo(() => specialFolderPaths.map(folderName), [specialFolderPaths])
    const actionStates = useMemo(() => states.map(({ state }) => state), [states])
    const hiddenFolderPaths = useMemo(() => [folderPath(projectFolder, LOGS_FOLDER_NAME)], [projectFolder])
    const tree = useMemo(() => buildFileTree(activeCards, backgroundCards, workingFolder, {
        actions,
        hiddenFolderPaths,
        projectFolder,
        repositoryFiles,
        specialFolderPaths,
    }), [actions, activeCards, backgroundCards, hiddenFolderPaths, projectFolder, repositoryFiles, specialFolderPaths, workingFolder])
    const cardsByPath = useMemo(() => {
        const map = new Map<string, ProjectCard>()
        for (const card of [...activeCards, ...backgroundCards]) map.set(card.path, card)

        return map
    }, [activeCards, backgroundCards])
    const objectsByPath = useMemo(() => new Map<string, OpenDocumentObject>([
        ...cardsByPath,
        ...actions
            .filter((action): action is ActionDefinition & { sourcePath: string } => action.sourcePath !== null)
            .map((action) => [action.sourcePath, action] as const),
        ...actionService.getDeletedDraftActions()
            .filter((action): action is ActionDefinition & { sourcePath: string } => action.sourcePath !== null)
            .map((action) => [action.sourcePath, action] as const),
    ]), [actions, cardsByPath])
    const statusColors = useMemo(() => new Map(
        tree
            .filter((node) => node.kind === 'status')
            .map((node, index) => {
                const configuredState = states.find(({ state }) => state === node.label)

                return [node.label, configuredState?.color ?? defaultColumnAccent(index)]
            }),
    ), [states, tree])

    useEffect(() => {
        onDeleteFileRef.current = onDeleteFile
        onDeleteFolderRef.current = onDeleteFolder
        onLeftPanelInteractionRef.current = onLeftPanelInteraction
    })

    const handleDeleteFile = useCallback(async (path: string) => {
        await onDeleteFileRef.current(path)
        onLeftPanelInteractionRef.current()
    }, [])

    const handleDeleteFolder = useCallback(async (path: string) => {
        await onDeleteFolderRef.current(path)
        onLeftPanelInteractionRef.current()
    }, [])

    return (
        <>
            {visible ? <LeftPanelSlot>
                <Box
                    aria-label="File tree"
                    sx={{ bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
                >
                    <FileTreeView
                        cardTypes={cardTypes}
                        cardsByPath={cardsByPath}
                        nodes={tree}
                        objectsByPath={objectsByPath}
                        onCreateFolder={onCreateFolder}
                        onCreateMarkdownFile={onCreateMarkdownFile}
                        onDeleteFile={handleDeleteFile}
                        onDeleteFolder={handleDeleteFolder}
                        onLeftPanelInteraction={onLeftPanelInteraction}
                        projectFolder={projectFolder}
                        statusColors={statusColors}
                    />
                </Box>
            </LeftPanelSlot> : null}
            <Box hidden={!visible} sx={{ display: visible ? 'flex' : 'none', flex: 1, minHeight: 0 }}>
                <TextEditorPane
                    actionsFolder={actionsFolder}
                    cardTypes={cardTypes}
                    markdownDocumentNamespace={projectKey}
                    repositoryFiles={repositoryFiles}
                    specialContextTypes={specialContextTypes}
                    states={actionStates}
                    statusColors={statusColors}
                    visible={visible}
                />
            </Box>
        </>
    )
}
