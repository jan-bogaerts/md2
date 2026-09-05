import { describe, expect, it, vi } from 'vitest'
import {
    DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT,
    DIAGRAM_FRAGMENT_CLIPBOARD_VERSION,
} from './diagram_fragment_clipboard'
import type { DiagramPasteResult } from './diagram_edit_session_service'
import { DiagramPasteService } from './diagram_paste'

const sessionSnapshot = { sourceDiagramId: 'diagram' }
const payload = JSON.stringify({
    edges: [],
    format: DIAGRAM_FRAGMENT_CLIPBOARD_FORMAT,
    fragments: [],
    groups: [],
    nodes: [{ id: 'source', label: 'Source', role: 'focal', x: 4, y: 4 }],
    version: DIAGRAM_FRAGMENT_CLIPBOARD_VERSION,
})
const pastedResult: DiagramPasteResult = {identities: [{ objectId: 'pasted', objectKind: 'node' }]}

function pasteHarness(options: {
    clipboardReader?: () => Promise<string>
} = {}) {
    const pasteFragment = vi.fn().mockReturnValue(pastedResult)
    const session = { getSessionSnapshot: () => sessionSnapshot, pasteFragment }
    const selection = { replace: vi.fn() }
    const clipboardReader = options.clipboardReader ?? vi.fn().mockResolvedValue(payload)
    const errorReporter = vi.fn()
    const service = new DiagramPasteService(session, selection, clipboardReader, errorReporter)

    return { errorReporter, pasteFragment, selection, service }
}

describe('DiagramPasteService', () => {
    it('parses clipboard data, pastes at one grid offset, then selects created objects', async () => {
        const { errorReporter, pasteFragment, selection, service } = pasteHarness()

        await expect(service.paste()).resolves.toBe(true)

        expect(pasteFragment).toHaveBeenCalledOnce()
        expect(pasteFragment).toHaveBeenCalledWith(expect.objectContaining({ nodes: [expect.objectContaining({ id: 'source' })] }), 4)
        expect(selection.replace).toHaveBeenCalledWith(pastedResult.identities)
        expect(errorReporter).not.toHaveBeenCalled()
    })

    it('adds one deterministic grid offset for each repeated successful paste', async () => {
        const { pasteFragment, service } = pasteHarness()

        await service.paste()
        await service.paste()
        await service.paste()

        expect(pasteFragment.mock.calls.map((call) => call[1])).toEqual([4, 8, 12])
    })

    it('does not advance offset or replace selection when target validation rejects paste', async () => {
        const { pasteFragment, selection, service } = pasteHarness()
        pasteFragment.mockReset()
        pasteFragment
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(pastedResult)
            .mockReturnValueOnce(pastedResult)

        await expect(service.paste()).resolves.toBe(false)
        await expect(service.paste()).resolves.toBe(true)
        await expect(service.paste()).resolves.toBe(true)

        expect(pasteFragment.mock.calls.map((call) => call[1])).toEqual([4, 4, 8])
        expect(selection.replace).toHaveBeenCalledTimes(2)
    })

    it.each([
        ['clipboard read failure', vi.fn().mockRejectedValue(new Error('Clipboard denied'))],
        ['malformed clipboard data', vi.fn().mockResolvedValue('{')],
    ])('reports %s without requesting mutation or changing selection', async (_label, clipboardReader) => {
        const { errorReporter, pasteFragment, selection, service } = pasteHarness({ clipboardReader })

        await expect(service.paste()).resolves.toBe(false)

        expect(errorReporter).toHaveBeenCalledOnce()
        expect(pasteFragment).not.toHaveBeenCalled()
        expect(selection.replace).not.toHaveBeenCalled()
    })
})
