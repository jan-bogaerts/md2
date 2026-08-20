import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Card } from '../data/data_types'
import type { RemarkableBridge, RemarkableDeviceFile } from '../data/remarkable_bridge'
import { recordImports, remarkableDeviceKey, serializeImportMetadata, parseImportMetadata } from '../data/remarkable_import_metadata'
import { DialogDisplay } from './dialog_display'
import { RemarkableImportPanel } from './remarkable_import_panel'
import { dialogService } from '../services/dialog_service'

const DEVICE_FILE: RemarkableDeviceFile = { modifiedTime: '2026-07-01T10:00:00.000Z', name: 'note.png', path: '/img/note.png' }

const SETTINGS = { host: 'remarkable.local', imageFolder: '/img', password: 'secret', port: 22, username: 'root' }

function card(): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '# Goal',
        header: { affects: [], after: null, agentLogReferences: [], author: null, id: 'F-1', internalId: null, owner: null, policy: {}, references: [], status: 'new', title: 'Card' },
        hasFrontmatter:true,
        isActive: true,
        path: 'design/F-1-card.md',
    }
}

function importPlan() {
    return { cardPath: 'design/F-2-scans.md', commitFiles: [], importedAssetPaths: ['design/note.png'], message: '' }
}

function createBridge(overrides: Partial<RemarkableBridge> = {}): RemarkableBridge {
    return {
        importFiles: vi.fn(async () => [{ content: 'aW1n', modifiedTime: DEVICE_FILE.modifiedTime, name: 'note.png', sourcePath: '/img/note.png' }]),
        listImageFiles: vi.fn(async () => [DEVICE_FILE]),
        testConnection: vi.fn(async () => ({ message: null, ok: true })),
        ...overrides,
    }
}

function changeByName(name: string, value: string) {
    const input = document.querySelector(`input[name="${name}"]`)
    if (!input) throw new Error(`Missing input: ${name}`)
    fireEvent.change(input, { target: { value } })
}

function fillSettings() {
    changeByName('host', SETTINGS.host)
    changeByName('password', SETTINGS.password)
    changeByName('imageFolder', SETTINGS.imageFolder)
}

describe('RemarkableImportPanel', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('warns when the bridge is unavailable', () => {
        render(<RemarkableImportPanel activeCards={[]} bridge={null} isProjectOpen metadataContent={null} />)

        expect(screen.getByText(/requires Electron local mode/u)).toBeInTheDocument()
    })

    it('lists device files with their import status from metadata', async () => {
        const metadata = recordImports(parseImportMetadata(null), remarkableDeviceKey(SETTINGS), [
            { devicePath: '/img/note.png', localPath: 'design/note.png', modifiedTime: '2026-06-01T10:00:00.000Z' },
        ], '2026-06-01T11:00:00.000Z')
        const bridge = createBridge()
        render(
            <RemarkableImportPanel
                activeCards={[card()]}
                bridge={bridge}
                isProjectOpen
                metadataContent={serializeImportMetadata(metadata)}
            />,
        )

        fillSettings()
        fireEvent.click(screen.getByRole('button', { name: 'List files' }))

        expect(await screen.findByText('note.png')).toBeInTheDocument()
        // device time is newer than the recorded import, so the file reads as changed
        expect(screen.getByText('Changed')).toBeInTheDocument()
    })

    it('imports selected files into a new feature card', async () => {
        const onImport = vi.fn(async () => importPlan())
        const bridge = createBridge()
        render(
            <RemarkableImportPanel activeCards={[card()]} bridge={bridge} isProjectOpen metadataContent={null} onImport={onImport} />,
        )

        fillSettings()
        fireEvent.click(screen.getByRole('button', { name: 'List files' }))
        await screen.findByText('note.png')
        fireEvent.click(screen.getByRole('checkbox'))
        fireEvent.click(screen.getByLabelText('New feature card'))
        changeByName('newCardTitle', 'Scans')
        fireEvent.click(screen.getByRole('button', { name: 'Import selected' }))

        await waitFor(() => expect(onImport).toHaveBeenCalled())
        expect(onImport).toHaveBeenCalledWith(expect.objectContaining({
            paths: ['/img/note.png'],
            target: expect.objectContaining({ kind: 'new' }),
        }))
    })

    it('offers image-to-text conversion after import only when an agent is available', async () => {
        const onImport = vi.fn(async () => importPlan())
        const onConvert = vi.fn(async () => undefined)
        render(
            <RemarkableImportPanel
                activeCards={[card()]}
                agentAvailable
                bridge={createBridge()}
                isProjectOpen
                metadataContent={null}
                onConvert={onConvert}
                onImport={onImport}
            />,
        )

        fillSettings()
        fireEvent.click(screen.getByRole('button', { name: 'List files' }))
        await screen.findByText('note.png')
        fireEvent.click(screen.getByRole('checkbox'))
        fireEvent.click(screen.getByLabelText('New feature card'))
        changeByName('newCardTitle', 'Scans')

        expect(screen.queryByRole('button', { name: 'Convert images to text' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Import selected' }))
        const convertButton = await screen.findByRole('button', { name: 'Convert images to text' })
        fireEvent.click(convertButton)

        await waitFor(() => expect(onConvert).toHaveBeenCalledWith({
            cardPath: 'design/F-2-scans.md',
            imagePaths: ['design/note.png'],
        }))
    })

    it('hides image-to-text conversion when no agent is available', async () => {
        const onImport = vi.fn(async () => importPlan())
        render(
            <RemarkableImportPanel
                activeCards={[card()]}
                agentAvailable={false}
                bridge={createBridge()}
                isProjectOpen
                metadataContent={null}
                onImport={onImport}
            />,
        )

        fillSettings()
        fireEvent.click(screen.getByRole('button', { name: 'List files' }))
        await screen.findByText('note.png')
        fireEvent.click(screen.getByRole('checkbox'))
        fireEvent.click(screen.getByLabelText('New feature card'))
        changeByName('newCardTitle', 'Scans')
        fireEvent.click(screen.getByRole('button', { name: 'Import selected' }))

        await waitFor(() => expect(onImport).toHaveBeenCalled())
        expect(screen.queryByRole('button', { name: 'Convert images to text' })).not.toBeInTheDocument()
    })

    it('shows an error when importing with nothing selected', async () => {
        const onImport = vi.fn()
        render(
            <>
                <DialogDisplay />
                <RemarkableImportPanel
                    activeCards={[card()]}
                    bridge={createBridge()}
                    isProjectOpen
                    metadataContent={null}
                    onImport={onImport}
                />
            </>,
        )

        fillSettings()
        fireEvent.click(screen.getByRole('button', { name: 'Import selected' }))

        expect(await screen.findByText(/Select at least one image/u)).toBeInTheDocument()
        expect(onImport).not.toHaveBeenCalled()
    })

    it('surfaces a connection failure as an error', async () => {
        const bridge = createBridge({ testConnection: vi.fn(async () => ({ message: 'SSH refused', ok: false })) })
        const error = vi.spyOn(dialogService, 'error')
        render(
            <>
                <DialogDisplay />
                <RemarkableImportPanel activeCards={[card()]} bridge={bridge} isProjectOpen metadataContent={null} />
            </>,
        )

        fillSettings()
        fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))

        expect(await screen.findByText('SSH refused')).toBeInTheDocument()
        expect(error).toHaveBeenCalledTimes(1)
    })
})
