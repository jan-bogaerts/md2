import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSnapshot } from '../../data/data_types'
import { CardCountSummary } from './project_card_count_summary'

const projectState = vi.hoisted(() => ({ snapshot: null as ProjectSnapshot | null }))

vi.mock('../hooks/use_project_state', () => ({ useProjectState: () => projectState }))

describe('CardCountSummary', () => {
    afterEach(() => {
        cleanup()
        projectState.snapshot = null
    })

    it('reads total and active card counts from the project snapshot', () => {
        projectState.snapshot = {
            activeCards: [{}, {}],
            backgroundCards: [{}, {}, {}],
            repositoryFiles: [],
            workingFolder: 'design',
        } as unknown as ProjectSnapshot

        render(<CardCountSummary />)

        expect(screen.getByText('5')).toBeInTheDocument()
        expect(screen.getByText('cards')).toBeInTheDocument()
        expect(screen.getByText('2')).toBeInTheDocument()
        expect(screen.getByText('active')).toBeInTheDocument()
    })

    it('combines both counts in the mobile row', () => {
        projectState.snapshot = {
            activeCards: [{}, {}],
            backgroundCards: [{}],
            repositoryFiles: [],
            workingFolder: 'design',
        } as unknown as ProjectSnapshot

        render(<CardCountSummary mobile />)

        expect(screen.getByText('Cards')).toBeInTheDocument()
        expect(screen.getByText('3 total · 2 active')).toBeInTheDocument()
    })
})
