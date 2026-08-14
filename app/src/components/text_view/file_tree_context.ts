import { createContext, useContext } from 'react'
import type { CardTypeConfig, Card } from '../../data/data_types'
import { useDialogError } from '../hooks/use_dialog_error'
import type { CreateTreeItemKind } from './create_tree_item_dialog'

export interface FileTreeContextValue {
    cardTypes: CardTypeConfig[]
    cardsByPath: Map<string, Card>
    onDeleteFile: (path: string) => Promise<void>
    onDeleteFolder: (path: string) => Promise<void>
    onRequestCreate: (kind: CreateTreeItemKind, parentDirectory: string) => void
    readOnly: boolean
    statusColors: Map<string, string>
}

export const FileTreeContext = createContext<FileTreeContextValue | null>(null)

const ignoreDelete = async () => undefined
const ignoreCreateRequest = () => undefined
const FALLBACK_FILE_TREE_CONTEXT: FileTreeContextValue = {
    cardTypes: [],
    cardsByPath: new Map(),
    onDeleteFile: ignoreDelete,
    onDeleteFolder: ignoreDelete,
    onRequestCreate: ignoreCreateRequest,
    readOnly: false,
    statusColors: new Map(),
}

/** Access dependencies shared by virtualized file-tree rows with a safe fallback. */
export function useFileTreeContext(): FileTreeContextValue {
    const context = useContext(FileTreeContext)
    const error = context ? null : new Error('File tree row must be rendered inside FileTreeContext')
    useDialogError(error, 'File tree is unavailable')

    return context ?? FALLBACK_FILE_TREE_CONTEXT
}
