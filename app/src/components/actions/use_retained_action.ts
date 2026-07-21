import { useEffect, useState } from 'react'
import type { ActionDefinition } from '../../data/action_types'
import { openFilesService, type ActionOpenDocument } from '../../services/open_files_service'

function activeActionDocument(): ActionOpenDocument | null {
    const { activeDocument } = openFilesService.getSnapshot()

    return activeDocument?.kind === 'action' ? activeDocument : null
}

/** Resolve active action inside service-aware editor children. */
export function useRetainedAction(): ActionDefinition {
    const [retainedDocument, setRetainedDocument] = useState(() => {
        const document = activeActionDocument()
        if (!document) throw new Error('Action editor child requires an active action document')

        return document
    })
    useEffect(() => {
        const handleChanged = () => {
            const document = activeActionDocument()
            if (document) setRetainedDocument(document)
        }
        openFilesService.addEventListener('changed', handleChanged)

        return () => openFilesService.removeEventListener('changed', handleChanged)
    }, [])

    return retainedDocument.getObject()
}
