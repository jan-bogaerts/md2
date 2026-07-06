import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HeaderEditorPanel, type HeaderFieldValue } from './header_editor_panel'

const FIELDS: Record<string, HeaderFieldValue> = {
    affects: ['a.ts', 'b.ts'],
    customField: 'keep me',
    id: 'F-1',
    policy: { checkLinting: 'true' },
    status: 'active',
    title: 'Alpha',
}

function renderPanel(fields: Record<string, HeaderFieldValue> = FIELDS) {
    const onFieldChange = vi.fn()
    render(<HeaderEditorPanel fields={fields} onFieldChange={onFieldChange} title="Alpha" />)

    return { onFieldChange }
}

function expandPanel() {
    fireEvent.click(screen.getByLabelText('Toggle header fields'))
}

describe('HeaderEditorPanel', () => {
    afterEach(cleanup)

    it('shows only the title while collapsed', () => {
        renderPanel()

        expect(screen.getByText('Alpha')).toBeTruthy()
        expect(screen.getByLabelText('Toggle header fields').getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByLabelText('Header field status')).toBeNull()
    })

    it('shows every header field when expanded, including unknown keys', () => {
        renderPanel()
        expandPanel()

        expect((screen.getByLabelText('Header field id') as HTMLInputElement).value).toBe('F-1')
        expect((screen.getByLabelText('Header field status') as HTMLInputElement).value).toBe('active')
        expect((screen.getByLabelText('Header field customField') as HTMLInputElement).value).toBe('keep me')
        expect(screen.getByText('a.ts, b.ts')).toBeTruthy()
        expect(screen.getByText('checkLinting: true')).toBeTruthy()
    })

    it('commits an edited scalar field on blur', () => {
        const { onFieldChange } = renderPanel()
        expandPanel()

        const statusInput = screen.getByLabelText('Header field status')
        fireEvent.change(statusInput, { target: { value: 'ready' } })
        fireEvent.blur(statusInput)

        expect(onFieldChange).toHaveBeenCalledWith('status', 'ready')
    })

    it('commits an edited scalar field on Enter', () => {
        const { onFieldChange } = renderPanel()
        expandPanel()

        const idInput = screen.getByLabelText('Header field id')
        fireEvent.change(idInput, { target: { value: 'F-2' } })
        fireEvent.keyDown(idInput, { key: 'Enter' })

        expect(onFieldChange).toHaveBeenCalledWith('id', 'F-2')
    })

    it('does not commit unchanged fields on blur', () => {
        const { onFieldChange } = renderPanel()
        expandPanel()

        fireEvent.blur(screen.getByLabelText('Header field status'))

        expect(onFieldChange).not.toHaveBeenCalled()
    })
})
