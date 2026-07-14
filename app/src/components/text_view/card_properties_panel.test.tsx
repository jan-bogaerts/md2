import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardPropertiesPanel } from './card_properties_panel'

function renderPanel(overrides: Partial<Parameters<typeof CardPropertiesPanel>[0]> = {}) {
    const onAuthorChange = vi.fn()
    const onAutoMergeChange = vi.fn()
    const onTitleChange = vi.fn()
    render(
        <AppThemeProvider>
            <CardPropertiesPanel
                affects={[]}
                author="JB"
                id="F-1"
                onAuthorChange={onAuthorChange}
                onAutoMergeChange={onAutoMergeChange}
                onTitleChange={onTitleChange}
                policy={{}}
                status="design"
                statusColor="#123456"
                title="Alpha"
                {...overrides}
            />
        </AppThemeProvider>,
    )

    return { onAuthorChange, onAutoMergeChange, onTitleChange }
}

describe('CardPropertiesPanel', () => {
    afterEach(cleanup)

    it('shows only requested properties and empty Affects state', () => {
        renderPanel()
        const properties = within(screen.getByLabelText('Card properties'))

        expect(properties.getByText('Title')).toBeInTheDocument()
        expect(properties.getByText('Status')).toBeInTheDocument()
        expect(properties.getByText('Author')).toBeInTheDocument()
        expect(properties.getByText('Affects')).toBeInTheDocument()
        expect(properties.getByText('Policy')).toBeInTheDocument()
        expect(properties.getByText('None')).toBeInTheDocument()
        expect(properties.queryByText('Owner')).not.toBeInTheDocument()
        expect(properties.queryByText('Agents')).not.toBeInTheDocument()
        expect(properties.queryByText('Internal ID')).not.toBeInTheDocument()
    })

    it('commits controlled Title and Author edits on blur', () => {
        const { onAuthorChange, onTitleChange } = renderPanel()

        fireEvent.change(screen.getByLabelText('Card title'), { target: { value: 'Beta' } })
        fireEvent.blur(screen.getByLabelText('Card title'))
        fireEvent.change(screen.getByLabelText('Card author'), { target: { value: 'AB' } })
        fireEvent.blur(screen.getByLabelText('Card author'))

        expect(onTitleChange).toHaveBeenCalledWith('Beta')
        expect(onAuthorChange).toHaveBeenCalledWith('AB')
    })

    it('selects Manual or Auto-merge through the policy chip', () => {
        const { onAutoMergeChange } = renderPanel()

        fireEvent.mouseDown(screen.getByLabelText('Card policy'))
        fireEvent.click(screen.getByRole('option', { name: 'Auto-merge' }))

        expect(onAutoMergeChange).toHaveBeenCalledWith(true)
    })

    it('shows a non-collapsible section heading', () => {
        renderPanel()

        expect(screen.getByRole('heading', { name: 'Properties' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Properties/ })).not.toBeInTheDocument()
        expect(screen.getByLabelText('Card title')).toBeVisible()
    })
})
