import { useCallback, useSyncExternalStore } from 'react'
import type { ProjectCard } from '../../data/data_types'
import { cardMarkdownDataSource, type CardMarkdownDataSource } from '../editor/card_markdown_data_source'
import type { MarkdownBindingKind } from '../editor/markdown_data_source'

type CardBinding = Exclude<MarkdownBindingKind, 'list-action'>

/** Subscribe to the card currently assigned to one card-editor binding. */
export function useActiveCard(
    binding: CardBinding,
    dataSource: CardMarkdownDataSource = cardMarkdownDataSource,
): ProjectCard | null {
    const subscribe = useCallback((onStoreChange: () => void) => {
        dataSource.addEventListener('activeDocumentChanged', onStoreChange)
        dataSource.addEventListener('cardsChanged', onStoreChange)

        return () => {
            dataSource.removeEventListener('activeDocumentChanged', onStoreChange)
            dataSource.removeEventListener('cardsChanged', onStoreChange)
        }
    }, [dataSource])
    const getSnapshot = useCallback(() => dataSource.getActiveCard(binding), [binding, dataSource])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
