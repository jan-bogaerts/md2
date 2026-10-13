import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import { DiagramSaveService } from '../../../services/diagrams/diagram_save_service'
import type { DiagramRecord } from '../../../services/diagrams/diagram_index'
import { DiagramSaveButton } from './diagram_save_button'

const diagram: DiagramData = {
    edges: [], groups: [], meta: { description: 'Architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [{ id: 'orders', label: 'Orders', role: 'focal' }],
}
const sourceRecord: DiagramRecord = { actionId: 'overview', id: 'source', label: 'Overview', path: 'design/diagrams/overview.json' }

afterEach(cleanup)

describe('DiagramSaveButton', () => {
    it('saves a dirty diagram without opening Review and shows saved state after persistence', async () => {
        const source = {
            getSourceSnapshot: () => ({ diagram, record: sourceRecord }),
            subscribeSource: () => () => undefined,
        }
        const session = new DiagramEditSessionService(source)
        session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
        session.start()
        const savedRecord = { ...sourceRecord, id: 'copy', sourceDiagramId: sourceRecord.id }
        let persist: ((record: DiagramRecord) => void) | null = null
        const persistence = {
            queueEditedDiagramCopy: vi.fn(async (_request: unknown, onPersisted: (record: DiagramRecord) => void) => {
                persist = onPersisted

                return savedRecord
            }),
            flushQueuedDiagrams: vi.fn(async () => { persist?.(savedRecord) }),
        }
        const save = new DiagramSaveService(session, persistence)
        const user = userEvent.setup()
        render(<DiagramSaveButton save={save} session={session} />)

        expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()
        act(() => { session.setNodeField('orders', 'label', 'Purchases') })
        await user.click(screen.getByRole('button', { name: 'Save' }))

        expect(persistence.flushQueuedDiagrams).toHaveBeenCalledOnce()
        expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()
        expect(session.read.getSavedRecordSnapshot()).toEqual(savedRecord)
    })
})
