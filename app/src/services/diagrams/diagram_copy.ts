import { dialogService } from '../dialog_service'
import {
    buildDiagramFragmentClipboardPayload,
    serializeDiagramFragmentClipboardPayload,
    type DiagramFragmentReader,
} from './diagram_fragment_clipboard'
import { diagramEditSessionService } from './diagram_edit_session_service'
import {
    diagramFormatPasteService,
    type DiagramFormatPasteService,
} from './diagram_format_paste_service'
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
    formatPaste: Pick<DiagramFormatPasteService, 'captureSuccessfulCopy'> = diagramFormatPasteService,
) {
    try {
        const connectionOnly = identities.length === 1 && identities[0].objectKind === 'edge'
        if (connectionOnly) {
            if (!formatPaste.captureSuccessfulCopy(identities, session)) {
                throw new Error('Diagram connection could not be captured as a format source')
            }

            return true
        }

        const payload = buildDiagramFragmentClipboardPayload(identities, session)
        if (!payload) throw new Error('Diagram selection cannot form a supported clipboard fragment')

        await clipboardWriter(serializeDiagramFragmentClipboardPayload(payload))
        formatPaste.captureSuccessfulCopy(identities, session)

        return true
    } catch (error) {
        errorReporter(error)

        return false
    }
}
