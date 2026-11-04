import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_CONFIG } from '../../../data/data_types'
import { dialogService } from '../../../services/dialog_service'
import type { DiagramData } from '../../../services/diagrams/diagram_data'
import type { DiagramRecord } from '../../../services/diagrams/diagram_index'
import { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import { DiagramSaveService } from '../../../services/diagrams/diagram_save_service'
import { projectAccessService } from '../../../services/project/project_access_service'
import type { DiagramViewSourceSnapshot, SaveEditedDiagramCopyRequest } from '../../../services/diagrams/diagram_view_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { DiagramChangeReviewDialog } from './diagram_change_review_dialog'
import { DiagramChangeReviewService } from './diagram_change_review_service'

vi.mock('../../editor/markdown_editor', () => ({
    MarkdownEditor: ({ draft }: {
        draft: { edit(value: string): void; getSnapshot(): string }
    }) => (
        <textarea
            aria-label="Markdown editor"
            defaultValue={draft.getSnapshot()}
            onChange={(event) => draft.edit(event.target.value)}
        />
    ),
}))

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', legendEntryId: 'connection', to: 'store' }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: {
        description: 'Orders architecture',
        legend: [
            { id: 'focal', label: 'Focal', role: 'focal' },
            { id: 'store', label: 'Store', role: 'store' },
            { id: 'connection', kind: 'connection', label: 'Connection', useLabelAsDefault: false },
        ],
        title: 'Overview',
        type: 'architecture',
        version: 3,
    },
    nodes: [
        { id: 'orders', label: 'Orders', legendEntryId: 'focal', role: 'focal' },
        { id: 'store', label: 'Store', legendEntryId: 'store', role: 'store' },
    ],
}
const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const cardTypes = [
    { color: '#123456', idPrefix: 'J', label: 'Job', type: 'job' },
    { color: '#654321', idPrefix: 'F', label: 'Feature', type: 'feature' },
]
const states = [
    { alwaysVisible: true, color: '#123456', state: 'new' },
    { alwaysVisible: true, color: '#654321', state: 'ready' },
]
const config = { ...DEFAULT_PROJECT_CONFIG, cardTypes, states, workingFolder: 'design/feature_descriptions' }

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot

    constructor(source: DiagramViewSourceSnapshot) {
        super()
        this.source = source
    }

    getSourceSnapshot = (): DiagramViewSourceSnapshot => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

class CardCreationStub extends EventTarget {
    private snapshot = { isCreatingCard: false }
    readonly createCard = vi.fn(async () => undefined)

    getCardCreationSnapshot = () => this.snapshot
}

function createSession(sourceRecord: DiagramRecord = record) {
    const session = new DiagramEditSessionService(new DiagramSourceStub({ diagram, record: sourceRecord }))
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    if (sourceRecord.pendingImplementation) session.restoreCreation(sourceRecord.id, null, null)
    else session.start()

    return session
}

function createReview(
    session: DiagramEditSessionService,
    generate: () => string = () => '- Change diagram.',
    validate: (content: string) => DiagramData = () => diagram,
) {
    return new DiagramChangeReviewService(
        session,
        { replace: vi.fn(() => true) },
        generate,
        validate,
        { getConfig: () => config },
    )
}

function renderDialog(dialog: ReactElement) {
    return render(<AppThemeProvider>{dialog}</AppThemeProvider>)
}

afterEach(() => {
    cleanup()
    projectAccessService.setReadOnly(false)
    vi.restoreAllMocks()
})

describe('DiagramChangeReviewDialog', () => {
    it('shows card fields, editable Markdown, no success alert, and desktop resize layout', () => {
        const session = createSession()
        session.objects.setNodeField('orders', 'label', 'Purchases')
        const review = createReview(session)
        review.open()

        renderDialog(
            <DiagramChangeReviewDialog
                cardTypes={cardTypes}
                project={new CardCreationStub()}
                review={review}
                session={session}
                states={states}
            />,
        )

        const dialog = screen.getByRole('dialog', { name: 'Add card to implement diagram' })
        expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveValue('implement Overview')
        expect(within(dialog).getByRole('radio', { name: 'Job' })).toBeChecked()
        expect(within(dialog).getByLabelText('Target column')).toHaveTextContent('new')
        expect(within(dialog).getByRole('textbox', { name: 'Markdown editor' })).toHaveValue('- Change diagram.')
        expect(within(dialog).queryByText('Editable diagram is valid.')).not.toBeInTheDocument()
        expect(dialog).toHaveStyle({ resize: 'both' })
    })

    it('uses full-screen non-resizable layout on mobile', () => {
        vi.spyOn(window, 'matchMedia').mockImplementation(() => ({
            addEventListener: vi.fn(),
            addListener: vi.fn(),
            dispatchEvent: vi.fn(),
            matches: true,
            media: '',
            onchange: null,
            removeEventListener: vi.fn(),
            removeListener: vi.fn(),
        }))
        const session = createSession()
        const review = createReview(session)
        review.open()

        renderDialog(
            <DiagramChangeReviewDialog
                cardTypes={cardTypes}
                project={new CardCreationStub()}
                review={review}
                session={session}
                states={states}
            />,
        )

        expect(screen.getByRole('dialog', { name: 'Add card to implement diagram' })).toHaveStyle({
            height: '100dvh',
            resize: 'none',
            width: '100%',
        })
    })

    it('creates one card from edited title, type, column, and Markdown then closes', async () => {
        const session = createSession()
        session.objects.setNodeField('orders', 'label', 'Purchases')
        const review = createReview(session)
        const project = new CardCreationStub()
        review.open()

        renderDialog(
            <DiagramChangeReviewDialog
                cardTypes={cardTypes}
                project={project}
                review={review}
                session={session}
                states={states}
            />,
        )
        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Implement purchases' } })
        fireEvent.click(screen.getByRole('radio', { name: 'Feature' }))
        fireEvent.mouseDown(screen.getByLabelText('Target column'))
        fireEvent.click(screen.getByRole('option', { name: 'ready' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Markdown editor' }), { target: { value: 'Edited body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add card' }))

        await waitFor(() => expect(project.createCard).toHaveBeenCalledWith(
            { body: 'Edited body', title: 'Implement purchases', type: 'feature' },
            'ready',
        ))
        expect(project.createCard).toHaveBeenCalledOnce()
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add card to implement diagram' })).not.toBeInTheDocument())
    })

    it('allows empty pending-diagram review because source link supplies context', () => {
        const pendingRecord = { ...record, pendingImplementation: true as const }
        const session = createSession(pendingRecord)
        const review = createReview(session, () => '')
        review.open()

        renderDialog(
            <DiagramChangeReviewDialog
                cardTypes={cardTypes}
                project={new CardCreationStub()}
                review={review}
                session={session}
                states={states}
            />,
        )

        expect(screen.getByText('No diagram changes to review.')).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Markdown editor' })).toHaveValue(
            'Implement diagram [Overview](<../diagrams/overview.json>).',
        )
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Add card' })).toBeEnabled()
    })

    it('keeps dialog and edited draft open after card creation failure', async () => {
        const session = createSession()
        session.objects.setNodeField('orders', 'label', 'Purchases')
        const review = createReview(session)
        const project = new CardCreationStub()
        project.createCard.mockRejectedValueOnce(new Error('creation failed'))
        review.open()

        renderDialog(
            <DiagramChangeReviewDialog
                cardTypes={cardTypes}
                project={project}
                review={review}
                session={session}
                states={states}
            />,
        )
        fireEvent.change(screen.getByRole('textbox', { name: 'Markdown editor' }), { target: { value: 'Retry body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add card' }))

        await waitFor(() => expect(project.createCard).toHaveBeenCalledOnce())
        expect(screen.getByRole('dialog', { name: 'Add card to implement diagram' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Markdown editor' })).toHaveValue('Retry body')
        expect(review.markdownDraft.getSnapshot()).toBe('Retry body')
    })

    it('shows exact invalid reason and disables save and card creation', () => {
        const session = createSession()
        session.objects.setNodeField('orders', 'label', 'Purchases')
        const review = createReview(session, () => 'body', () => {
            throw new Error('Malformed diagram data: nodes.orders.label has empty string')
        })
        review.open()

        renderDialog(
            <DiagramChangeReviewDialog
                cardTypes={cardTypes}
                project={new CardCreationStub()}
                review={review}
                session={session}
                states={states}
            />,
        )

        expect(screen.getByText('Malformed diagram data: nodes.orders.label has empty string')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Add card' })).toBeDisabled()
    })

    it('keeps Save behavior and closes only after persistence succeeds', async () => {
        const session = createSession()
        session.objects.setNodeField('orders', 'label', 'Purchases')
        const review = createReview(session)
        const savedRecord = { ...record, id: 'copy', path: 'design/diagrams/overview-edited.json', sourceDiagramId: record.id }
        let finishSave: () => void = () => undefined
        const pendingSave = new Promise<void>((resolve) => { finishSave = resolve })
        let persist: ((nextRecord: DiagramRecord) => void) | null = null
        const persistence = {
            queueEditedDiagramCopy: vi.fn<(
                request: SaveEditedDiagramCopyRequest,
                onPersisted: (nextRecord: DiagramRecord) => void,
            ) => Promise<DiagramRecord>>(async (_request, onPersisted) => {
                    persist = onPersisted

                    return savedRecord
                }),
            flushQueuedDiagrams: vi.fn(async () => {
                await pendingSave
                persist?.(savedRecord)
            }),
        }
        const save = new DiagramSaveService(session, persistence)
        review.open()

        renderDialog(
            <DiagramChangeReviewDialog
                cardTypes={cardTypes}
                project={new CardCreationStub()}
                review={review}
                save={save}
                session={session}
                states={states}
            />,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
        finishSave()
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add card to implement diagram' })).not.toBeInTheDocument())
        expect(session.read.getSavedRecordSnapshot()).toBe(savedRecord)
        expect(session.read.getDirtySnapshot()).toBe(false)
    })

    it('reports Save failure while retaining dialog and diagram edits', async () => {
        const session = createSession()
        session.objects.setNodeField('orders', 'label', 'Purchases')
        const review = createReview(session)
        const persistence = {
            queueEditedDiagramCopy: vi.fn<(
                request: SaveEditedDiagramCopyRequest,
                onPersisted: (nextRecord: DiagramRecord) => void,
            ) => Promise<DiagramRecord>>(async () => ({ ...record, id: 'copy', sourceDiagramId: record.id })),
            flushQueuedDiagrams: vi.fn(async () => { throw new Error('commit failed') }),
        }
        const save = new DiagramSaveService(session, persistence)
        const error = vi.spyOn(dialogService, 'error').mockReturnValue({
            critical: false,
            id: 1,
            message: 'commit failed',
            severity: 'error',
            title: 'Error',
        })
        review.open()

        renderDialog(
            <DiagramChangeReviewDialog
                cardTypes={cardTypes}
                project={new CardCreationStub()}
                review={review}
                save={save}
                session={session}
                states={states}
            />,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'commit failed' }),
            { fallbackMessage: 'Edited diagram could not be saved' },
        ))
        expect(screen.getByRole('dialog', { name: 'Add card to implement diagram' })).toBeInTheDocument()
        expect(session.read.getDirtySnapshot()).toBe(true)
    })

    it('closes without creating a card or clearing edits', async () => {
        const session = createSession()
        session.objects.setNodeField('orders', 'label', 'Purchases')
        const review = createReview(session)
        const project = new CardCreationStub()
        review.open()

        renderDialog(
            <DiagramChangeReviewDialog
                cardTypes={cardTypes}
                project={project}
                review={review}
                session={session}
                states={states}
            />,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add card to implement diagram' })).not.toBeInTheDocument())
        expect(project.createCard).not.toHaveBeenCalled()
        expect(session.read.getNodeFieldSnapshot('orders', 'label')).toBe('Purchases')
        expect(session.read.getChangeIdsSnapshot()).toHaveLength(1)
    })
})
