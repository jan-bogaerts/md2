import { dialogService } from '../dialog_service'
import {
    buildDiagramFragmentClipboardPayload,
    serializeDiagramFragmentClipboardPayload,
    type DiagramFragmentReader,
} from './diagram_fragment_clipboard'
import { diagramEditSessionService } from './diagram_edit_session_service'
import type { DiagramSelectionIdentity } from './diagram_selection_service'

export type DiagramCopySession = DiagramFragmentReader
export type DiagramCopyClipboardWriter = (content: string) => Promise<void>
export type DiagramCopyErrorReporter = (error: unknown) => void

function writeClipboard(content: string) {
    return navigator.clipboard.writeText(content)
}

function reportClipboardError(error: unknown) {
    dialogService.error(error, { fallbackMessage: 'Diagram selection could not be copied to clipboard' })
}

/** Writes one selected diagram fragment without changing selection or edit-session state. */
export async function copyDiagramSelection(
    identities: readonly DiagramSelectionIdentity[],
    session: DiagramCopySession = diagramEditSessionService,
    clipboardWriter: DiagramCopyClipboardWriter = writeClipboard,
    errorReporter: DiagramCopyErrorReporter = reportClipboardError,
) {
    try {
        const payload = buildDiagramFragmentClipboardPayload(identities, session)
        if (!payload) throw new Error('Diagram selection cannot form a supported clipboard fragment')

        await clipboardWriter(serializeDiagramFragmentClipboardPayload(payload))

        return true
    } catch (error) {
        errorReporter(error)

        return false
    }
}
