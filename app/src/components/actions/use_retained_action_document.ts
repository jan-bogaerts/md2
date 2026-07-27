import { useEffect, useState } from 'react'
import {
    openFilesService,
    type ActionOpenDocument,
    type OpenDocumentEventDetail,
} from '../../services/open_files_service'

function activeActionDocument(): ActionOpenDocument | null {
    const { activeDocument } = openFilesService.getSnapshot()

    return activeDocument?.kind === 'action' ? activeDocument : null
}

/** Retain the last active action document until the document is removed. */
export function useRetainedActionDocument(): ActionOpenDocument | null {
    const [retainedDocument, setRetainedDocument] = useState<ActionOpenDocument | null>(() => activeActionDocument())
    useEffect(() => {
        const handleChanged = () => {
            const document = activeActionDocument()
            if (document) setRetainedDocument(document)
        }
        const handleRemoved = (event: Event) => {
            const { document } = (event as CustomEvent<OpenDocumentEventDetail>).detail
            setRetainedDocument((retained) => retained === document ? null : retained)
        }
        openFilesService.addEventListener('changed', handleChanged)
        openFilesService.addEventListener('removed', handleRemoved)

        return () => {
            openFilesService.removeEventListener('changed', handleChanged)
            openFilesService.removeEventListener('removed', handleRemoved)
        }
    }, [])

    return retainedDocument
}
