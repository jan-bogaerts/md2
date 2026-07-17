import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardBodyEditor } from './card_body_editor'
import type { ProjectCard } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'

function card(overrides: Partial<ProjectCard> = {}): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        headerFields: {},
        content: '# Alpha\n\nOriginal body',
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: 'F-1', internalId: 'f-1', owner: null, policy: {}, status: 'todo',
            title: 'Alpha',
        },
        isActive: true,
        path: 'design/F-1-a.md',
        ...overrides,
    }
}

function renderCardBodyEditor(props: Parameters<typeof CardBodyEditor>[0]) {
    return render(
        <AppThemeProvider>
            <CardBodyEditor {...props} />
        </AppThemeProvider>,
    )
}

function editorProps(overrides: Partial<Parameters<typeof CardBodyEditor>[0]> = {}): Parameters<typeof CardBodyEditor>[0] {
    return {
        card: card(),
        isFullscreen: false,
        onBodyChange: vi.fn(),
        onDirtyChange: vi.fn(),
        onToggleFullscreen: vi.fn(),
        ...overrides,
    }
}

describe('CardBodyEditor', () => {
    afterEach(cleanup)

    it('seeds the editor with the card body only', () => {
        renderCardBodyEditor(editorProps())

        expect(screen.getByRole('textbox')).toHaveValue('# Alpha\n\nOriginal body')
    })

    it('reports body edits with the card path when the editor unmounts (popup close)', () => {
        const onBodyChange = vi.fn()
        const { unmount } = renderCardBodyEditor(editorProps({ onBodyChange }))

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Alpha\n\nEdited body' } })
        expect(onBodyChange).not.toHaveBeenCalled()
        unmount()

        expect(onBodyChange).toHaveBeenCalledWith('design/F-1-a.md', '# Alpha\n\nEdited body')
    })

    it('reports local dirty state while body edits remain buffered', () => {
        const onDirtyChange = vi.fn()
        renderCardBodyEditor(editorProps({ onDirtyChange }))

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Alpha\n\nEdited body' } })

        expect(onDirtyChange).toHaveBeenLastCalledWith('design/F-1-a.md', true)
    })

    it('keeps the toolbar sticky on mobile', () => {
        const { container } = renderCardBodyEditor(editorProps({isMobile: true}))

        expect(container.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()
    })
})
