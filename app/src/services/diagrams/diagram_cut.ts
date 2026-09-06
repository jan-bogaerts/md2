import { dialogService } from '../dialog_service'
import {
    buildDiagramFragmentClipboardPayload,
    serializeDiagramFragmentClipboardPayload,
    type DiagramFragmentReader,
} from './diagram_fragment_clipboard'
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
} from './diagram_edit_session_service'
import type { DiagramSelectionIdentity } from './diagram_selection_service'

export type DiagramCutSession = DiagramFragmentReader & Pick<DiagramEditSessionService, 'removeObjects'>
export type DiagramClipboardWriter = (content: string) => Promise<void>
export type DiagramCutErrorReporter = (error: unknown) => void

function writeClipboard(content: string) {
    return navigator.clipboard.writeText(content)
}

function reportClipboardError(error: unknown) {
    dialogService.error(error, { fallbackMessage: 'Diagram selection could not be cut to clipboard' })
}

export function canCutDiagramSelection(
    identities: readonly DiagramSelectionIdentity[],
    session: DiagramFragmentReader = diagramEditSessionService,
) {
    return !!buildDiagramFragmentClipboardPayload(identities, session)
}

/** Writes one captured selection before removing those same identities through the shared deletion batch. */
export async function cutDiagramSelection(
    identities: readonly DiagramSelectionIdentity[],
    session: DiagramCutSession = diagramEditSessionService,
    clipboardWriter: DiagramClipboardWriter = writeClipboard,
    errorReporter: DiagramCutErrorReporter = reportClipboardError,
) {
    const capturedIdentities = identities.map(({ objectId, objectKind }) => ({ objectId, objectKind }))
    const payload = buildDiagramFragmentClipboardPayload(capturedIdentities, session)
    if (!payload) return false

    try {
        await clipboardWriter(serializeDiagramFragmentClipboardPayload(payload))
    } catch (error) {
        errorReporter(error)

        return false
    }

    return session.removeObjects(capturedIdentities)
}
