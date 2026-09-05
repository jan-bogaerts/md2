import { dialogService } from '../dialog_service'
import { register } from '../service_injector'
import { parseDiagramFragmentClipboardPayload } from './diagram_fragment_clipboard'
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
    type DiagramEditSessionSnapshot,
} from './diagram_edit_session_service'
import { DIAGRAM_GRID_SIZE } from './diagram_layout'
import {
    diagramSelectionService,
    type DiagramSelectionService,
} from './diagram_selection_service'

export type DiagramPasteClipboardReader = () => Promise<string>
export type DiagramPasteErrorReporter = (error: unknown) => void

type DiagramPasteSession = Pick<DiagramEditSessionService, 'getSessionSnapshot' | 'pasteFragment'>
type DiagramPasteSelection = Pick<DiagramSelectionService, 'replace'>

function readClipboard() {
    return navigator.clipboard.readText()
}

function reportPasteError(error: unknown) {
    dialogService.error(error, { fallbackMessage: 'Diagram fragment could not be pasted from clipboard' })
}

/** Owns clipboard paste repetition so each successful repeat receives one additional grid offset. */
export class DiagramPasteService {
    private readonly clipboardReader: DiagramPasteClipboardReader
    private readonly errorReporter: DiagramPasteErrorReporter
    private lastClipboardContent: string | null = null
    private lastSession: DiagramEditSessionSnapshot | null = null
    private readonly selection: DiagramPasteSelection
    private readonly session: DiagramPasteSession
    private successfulPasteCount = 0

    constructor(
        session: DiagramPasteSession = diagramEditSessionService,
        selection: DiagramPasteSelection = diagramSelectionService,
        clipboardReader: DiagramPasteClipboardReader = readClipboard,
        errorReporter: DiagramPasteErrorReporter = reportPasteError,
    ) {
        this.clipboardReader = clipboardReader
        this.errorReporter = errorReporter
        this.selection = selection
        this.session = session
    }

    async paste() {
        try {
            const content = await this.clipboardReader()
            const sessionSnapshot = this.session.getSessionSnapshot()
            if (!sessionSnapshot) throw new Error('Cannot paste a diagram fragment without an active edit session')
            const payload = parseDiagramFragmentClipboardPayload(content)
            const repeatedPaste = content === this.lastClipboardContent && sessionSnapshot === this.lastSession
            const pasteCount = repeatedPaste ? this.successfulPasteCount + 1 : 1
            const result = this.session.pasteFragment(payload, pasteCount * DIAGRAM_GRID_SIZE)
            if (!result) return false

            this.selection.replace(result.identities)
            this.lastClipboardContent = content
            this.lastSession = sessionSnapshot
            this.successfulPasteCount = pasteCount

            return true
        } catch (error) {
            this.errorReporter(error)

            return false
        }
    }
}

export const diagramPasteService = register('diagramPasteService', new DiagramPasteService())
