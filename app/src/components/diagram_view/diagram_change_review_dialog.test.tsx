import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramSaveService } from '../../services/diagrams/diagram_save_service'
import { dialogService } from '../../services/dialog_service'
import type {
    DiagramViewSourceSnapshot, SaveEditedDiagramCopyRequest,
} from '../../services/diagrams/diagram_view_service'
import { DiagramChangeReviewDialog } from './diagram_change_review_dialog'
import { DiagramChangeReviewService } from './diagram_change_review_service'
import { DiagramChangeActionPopup } from './diagram_change_action_popup'

const { actionPopup } = vi.hoisted(() => ({
    actionPopup: vi.fn((props: { context: unknown }) => {
        void props

        return null
    }),
}))

vi.mock('../actions/run/popup/action_popup', () => ({ ActionPopup: actionPopup }))

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', to: 'store' }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
}
const record: DiagramRecord = {actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json'}

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot = { diagram, record }

    getSourceSnapshot = (): DiagramViewSourceSnapshot => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createSession() {
    const session = new DiagramEditSessionService(new DiagramSourceStub())
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    session.start()

    return session
}

afterEach(() => {
    cleanup()
    actionPopup.mockClear()
    vi.restoreAllMocks()
})

describe('DiagramChangeReviewDialog', () => {
    it('opens existing action popup with captured reviewed changes and diagram ID', async () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const review = new DiagramChangeReviewService(session, { replace: vi.fn(() => true) }, () => 'Reviewed changes')
        review.open()

        render(<><DiagramChangeReviewDialog review={review} session={session} /><DiagramChangeActionPopup review={review} /></>)
        fireEvent.click(screen.getByRole('button', { name: 'Send to agent' }))

        await waitFor(() => expect(actionPopup).toHaveBeenCalled())
        const popupProps = actionPopup.mock.calls.at(-1)?.[0]
        expect(popupProps?.context).toEqual({
            diagramChanges: 'Reviewed changes', diagramChangeSetId: expect.any(String), diagramId: 'diagram-1',
            kind: 'diagram', type: 'root',
        })
        await waitFor(() => (
            expect(screen.queryByRole('dialog', { name: 'Review diagram changes' })).not.toBeInTheDocument()
        ))
    })

    it('shows no-changes state and disables save and handoff', () => {
        const session = createSession()
        const review = new DiagramChangeReviewService(session, { replace: vi.fn(() => true) })
        review.open()

        render(<DiagramChangeReviewDialog review={review} session={session} />)

        const dialogElement = screen.getByRole('dialog', { name: 'Review diagram changes' })
        expect(within(dialogElement).getByText('No diagram changes to review.')).toBeInTheDocument()
        expect(within(dialogElement).getByText('No implementation instructions.')).toBeInTheDocument()
        expect(within(dialogElement).getByRole('button', { name: 'Save' })).toBeDisabled()
        expect(within(dialogElement).getByRole('button', { name: 'Send to agent' })).toBeDisabled()
    })

    it('shows grouped current changes, generated text, and valid actions', () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const review = new DiagramChangeReviewService(session, { replace: vi.fn(() => true) })
        review.open()

        render(<DiagramChangeReviewDialog review={review} session={session} />)

        const dialogElement = screen.getByRole('dialog', { name: 'Review diagram changes' })
        expect(within(dialogElement).getByText('Nodes')).toBeInTheDocument()
        expect(within(dialogElement).getByText('Editable diagram is valid.')).toBeInTheDocument()
        expect(within(dialogElement).getAllByText(/Change label of node "Purchases" from "Orders" to "Purchases"/u)).toHaveLength(2)
        expect(within(dialogElement).getByRole('button', { name: 'Save' })).toBeEnabled()
        expect(within(dialogElement).getByRole('button', { name: 'Send to agent' })).toBeEnabled()
    })

    it('disables Save during persistence and closes only after success', async () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const review = new DiagramChangeReviewService(session, { replace: vi.fn(() => true) })
        review.open()
        const savedRecord = { ...record, id: 'copy', path: 'design/diagrams/overview-edited-copy.json', sourceDiagramId: record.id }
        let finishSave: (saved: DiagramRecord) => void = () => undefined
        const pendingSave = new Promise<DiagramRecord>((resolve) => { finishSave = resolve })
        const persistence = {
            saveEditedDiagramCopy: vi.fn<(
                request: SaveEditedDiagramCopyRequest,
            ) => Promise<DiagramRecord>>(async () => pendingSave),
        }
        const save = new DiagramSaveService(session, persistence)

        render(<DiagramChangeReviewDialog review={review} save={save} session={session} />)
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
        expect(screen.getByRole('dialog', { name: 'Review diagram changes' })).toBeInTheDocument()
        finishSave(savedRecord)
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Review diagram changes' })).not.toBeInTheDocument())
        expect(session.getSavedRecordSnapshot()).toBe(savedRecord)
        expect(session.getDirtySnapshot()).toBe(false)
    })

    it('reports save failure while retaining review and edits', async () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const review = new DiagramChangeReviewService(session, { replace: vi.fn(() => true) })
        review.open()
        const persistence = {
            saveEditedDiagramCopy: vi.fn<(
                request: SaveEditedDiagramCopyRequest,
            ) => Promise<DiagramRecord>>(async () => { throw new Error('commit failed') }),
        }
        const save = new DiagramSaveService(session, persistence)
        const error = vi.spyOn(dialogService, 'error').mockReturnValue({critical: false, id: 1, message: 'commit failed', severity: 'error', title: 'Error'})

        render(<DiagramChangeReviewDialog review={review} save={save} session={session} />)
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'commit failed' }),
            { fallbackMessage: 'Edited diagram could not be saved' },
        ))
        expect(screen.getByRole('dialog', { name: 'Review diagram changes' })).toBeInTheDocument()
        expect(session.getDirtySnapshot()).toBe(true)
        expect(session.getSavedRecordSnapshot()).toBeNull()
    })

    it('identifies affected objects without modifying editable data', () => {
        const session = createSession()
        session.removeGroupMember('backend', 'orders')
        const replace = vi.fn(() => true)
        const review = new DiagramChangeReviewService(session, { replace })
        const editableBefore = JSON.stringify(session.getEditableDiagram())
        review.open()

        render(<DiagramChangeReviewDialog review={review} session={session} />)
        fireEvent.click(screen.getByRole('button', { name: /Remove node "Orders" from group "Backend"/u }))

        expect(replace).toHaveBeenCalledWith([
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'backend', objectKind: 'group' },
        ])
        expect(JSON.stringify(session.getEditableDiagram())).toBe(editableBefore)
    })

    it('updates one row while retaining explicitly generated report text', () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const review = new DiagramChangeReviewService(session, { replace: vi.fn(() => true) })
        review.open()

        render(<DiagramChangeReviewDialog review={review} session={session} />)
        act(() => session.setNodeField('orders', 'label', 'Sales'))

        const dialogElement = screen.getByRole('dialog', { name: 'Review diagram changes' })
        expect(within(dialogElement).getByText(/Change label of node "Sales" from "Orders" to "Sales"/u)).toBeInTheDocument()
        expect(within(dialogElement).getByText(/- Change label of node "Purchases" from "Orders" to "Purchases"/u)).toBeInTheDocument()
    })

    it('lists validation blocker and disables save and handoff', () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const validate = () => {
            throw new Error('Malformed diagram data: nodes.orders.label has empty string')
        }
        const review = new DiagramChangeReviewService(session, { replace: vi.fn(() => true) }, undefined, validate)
        review.open()

        render(<DiagramChangeReviewDialog review={review} session={session} />)

        expect(screen.getByText('Malformed diagram data: nodes.orders.label has empty string')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Send to agent' })).toBeDisabled()
    })

    it('closes review without clearing edits', async () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const review = new DiagramChangeReviewService(session, { replace: vi.fn(() => true) })
        review.open()

        render(<DiagramChangeReviewDialog review={review} session={session} />)
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        await waitFor(() => (
            expect(screen.queryByRole('dialog', { name: 'Review diagram changes' })).not.toBeInTheDocument()
        ))
        expect(session.getNodeFieldSnapshot('orders', 'label')).toBe('Purchases')
        expect(session.getChangeIdsSnapshot()).toHaveLength(1)
    })
})
