import { createContext, useContext } from 'react'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import type { CreateTreeItemKind } from './create_tree_item_dialog'

export interface FileTreeContextValue {
    cardTypes: CardTypeConfig[]
    cardsByPath: Map<string, ProjectCard>
    onDeleteFile: (path: string) => Promise<void>
    onDeleteFolder: (path: string) => Promise<void>
    onRequestCreate: (kind: CreateTreeItemKind, parentDirectory: string) => void
    statusColors: Map<string, string>
}

export const FileTreeContext = createContext<FileTreeContextValue | null>(null)

/** Access dependencies shared by virtualized file-tree rows. */
export function useFileTreeContext(): FileTreeContextValue {
    const context = useContext(FileTreeContext)
    if (!context) throw new Error('File tree row must be rendered inside FileTreeContext')

    return context
}
