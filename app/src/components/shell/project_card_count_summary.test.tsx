import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSnapshot } from '../../data/data_types'
import { ProjectCardCountSummary } from './project_card_count_summary'

const projectState = vi.hoisted(() => ({ snapshot: null as ProjectSnapshot | null }))

vi.mock('../hooks/use_project_state', () => ({ useProjectState: () => projectState }))

describe('ProjectCardCountSummary', () => {
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
        } as ProjectSnapshot

        render(<ProjectCardCountSummary />)

        expect(screen.getByText('5')).toBeInTheDocument()
        expect(screen.getByText('cards')).toBeInTheDocument()
        expect(screen.getByText('2')).toBeInTheDocument()
        expect(screen.getByText('active')).toBeInTheDocument()
    })
})
