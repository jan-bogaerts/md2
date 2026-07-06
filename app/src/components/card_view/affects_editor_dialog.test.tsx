import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCard } from '../../data/data_types'
import { AffectsEditorDialog } from './affects_editor_dialog'
import { filterAffectsSuggestions } from './affects_suggestions'

function card(): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '# Root',
        header: {
            affects: ['app/src/old.ts'],
            after: null,
            agentLogReferences: [],
            author: null,
            id: 'F-1',
            internalId: 'f-1',
            owner: null,
            policy: {},
            status: 'todo',
            title: 'Root',
        },
        isActive: true,
        path: 'design/F-1-root.md',
    }
}

describe('filterAffectsSuggestions', () => {
    it('filters by typed path and excludes duplicates and the card path', () => {
        const suggestions = filterAffectsSuggestions(
            ['app/src/old.ts', 'app/src/new.ts', 'design/F-1-root.md', 'desktop/main.js'],
            ['app/src/old.ts'],
            'design/F-1-root.md',
            'src',
        )

        expect(suggestions).toEqual(['app/src/new.ts'])
    })
})

describe('AffectsEditorDialog', () => {
    afterEach(cleanup)

    it('shows current affects and saves added exact repo paths', () => {
        const onSave = vi.fn()
        render(
            <AffectsEditorDialog
                card={card()}
                onClose={vi.fn()}
                onSave={onSave}
                repositoryFiles={['app/src/old.ts', 'app/src/new.ts', 'design/F-1-root.md']}
            />,
        )

        expect(screen.getByText('app/src/old.ts')).toBeInTheDocument()
        fireEvent.change(screen.getByRole('combobox', { name: 'Add affected file' }), { target: { value: 'app/src/new.ts' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(onSave).toHaveBeenCalledWith('design/F-1-root.md', ['app/src/old.ts', 'app/src/new.ts'])
    })

    it('removes an entry before saving', () => {
        const onSave = vi.fn()
        render(
            <AffectsEditorDialog
                card={card()}
                onClose={vi.fn()}
                onSave={onSave}
                repositoryFiles={['app/src/old.ts']}
            />,
        )

        const affectedFile = screen.getByRole('button', { name: 'app/src/old.ts' })
        fireEvent.keyDown(affectedFile, { key: 'Delete' })
        fireEvent.keyUp(affectedFile, { key: 'Delete' })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(onSave).toHaveBeenCalledWith('design/F-1-root.md', [])
    })

    it('does not allow unknown typed paths', () => {
        render(
            <AffectsEditorDialog
                card={card()}
                onClose={vi.fn()}
                onSave={vi.fn()}
                repositoryFiles={['app/src/old.ts']}
            />,
        )

        fireEvent.change(screen.getByRole('combobox', { name: 'Add affected file' }), { target: { value: 'missing.ts' } })

        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    })
})
