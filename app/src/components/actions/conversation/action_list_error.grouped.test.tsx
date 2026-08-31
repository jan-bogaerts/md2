import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../../data/action_types'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionLinkListEditor } from '../editor/action_link_list_editor'
import { ActionOnRulesEditor } from '../editor/action_on_rules_editor'

function renderNode(node: React.ReactElement) {
    return render(<AppThemeProvider>{node}</AppThemeProvider>)
}

describe('action list section errors', () => {
    afterEach(cleanup)

    it('shows a link-list error at the section level even when the collection is empty', () => {
        renderNode(
            <ActionLinkListEditor actions={[]} error="Unknown action id missing" label="Before" onChange={() => {}} value={[]} />,
        )

        expect(screen.getByText('Unknown action id missing')).toBeInTheDocument()
    })

    it('shows an output-rules error at the section level even when the collection is empty', () => {
        renderNode(
            <ActionOnRulesEditor actions={[]} error="Invalid regular expression" onChange={() => {}} value={[]} />,
        )

        expect(screen.getByText('Invalid regular expression')).toBeInTheDocument()
    })

    it('routes a link-list error to the exact invalid row', () => {
        const actions = [
            { id: 'first', label: 'First' },
            { id: 'second', label: 'Second' },
        ] as ActionDefinition[]
        renderNode(
            <ActionLinkListEditor
                actions={actions}
                error="Invalid action field onBefore[1]"
                errorIndex={1}
                label="Before"
                onChange={() => {}}
                value={['first', 'second']}
            />,
        )
        const inputs = screen.getAllByLabelText('Action')

        expect(inputs[0]).not.toHaveAttribute('aria-invalid', 'true')
        expect(inputs[1]).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByText('Invalid action field onBefore[1]')).toBeInTheDocument()
        expect(inputs[1]).toHaveAttribute('aria-describedby', screen.getByText('Invalid action field onBefore[1]').id)
    })

    it('routes a regular-expression error to the exact invalid row', () => {
        renderNode(
            <ActionOnRulesEditor
                actions={[]}
                error="Missing action field on[1].condition"
                errorIndex={1}
                onChange={() => {}}
                value={[
                    { actionId: 'first', condition: 'ok' },
                    { actionId: 'second', condition: ' \t\u2003' },
                ]}
            />,
        )
        const inputs = screen.getAllByLabelText('Regular expression')

        expect(inputs[0]).not.toHaveAttribute('aria-invalid', 'true')
        expect(inputs[1]).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByText('Missing action field on[1].condition')).toBeInTheDocument()
        expect(inputs[1]).toHaveAttribute('aria-describedby', screen.getByText('Missing action field on[1].condition').id)
    })

    it('shows action labels while persisting link ids and retaining stale ids', () => {
        const actions = [
            { id: 'first-id', label: 'First label' },
            { id: 'second-id', label: 'Second label' },
        ] as ActionDefinition[]
        const onChange = vi.fn()
        const view = renderNode(
            <ActionLinkListEditor actions={actions} label="Before" onChange={onChange} value={['first-id']} />,
        )

        expect(screen.getByLabelText('Action')).toHaveTextContent('First label')
        fireEvent.mouseDown(screen.getByLabelText('Action'))
        fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Second label' }))
        expect(onChange).toHaveBeenLastCalledWith(['second-id'])

        view.unmount()
        renderNode(
            <ActionLinkListEditor actions={actions} label="Before" onChange={() => {}} value={['removed-id']} />,
        )
        expect(screen.getByLabelText('Action')).toHaveTextContent('removed-id — unavailable')
    })

    it('reorders and removes linked actions', () => {
        const actions = [
            { id: 'first', label: 'First' },
            { id: 'second', label: 'Second' },
        ] as ActionDefinition[]
        const onChange = vi.fn()
        renderNode(
            <ActionLinkListEditor actions={actions} label="After" onChange={onChange} value={['first', 'second']} />,
        )

        fireEvent.click(screen.getAllByRole('button', { name: 'Move After action down' })[0])
        expect(onChange).toHaveBeenLastCalledWith(['second', 'first'])

        fireEvent.click(screen.getAllByRole('button', { name: 'Remove After action' })[0])
        expect(onChange).toHaveBeenLastCalledWith(['second'])
    })

    it('adds the first unused linked-action id', () => {
        const actions = [
            { id: 'first', label: 'First' },
            { id: 'second', label: 'Second' },
        ] as ActionDefinition[]
        const onChange = vi.fn()
        renderNode(
            <ActionLinkListEditor actions={actions} label="Before" onChange={onChange} value={['first']} />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Add action' }))

        expect(onChange).toHaveBeenCalledWith(['first', 'second'])
    })

    it('shows action labels while persisting output-rule ids and retaining stale ids', () => {
        const actions = [
            { id: 'first-id', label: 'First label' },
            { id: 'second-id', label: 'Second label' },
        ] as ActionDefinition[]
        const onChange = vi.fn()
        const view = renderNode(
            <ActionOnRulesEditor
                actions={actions}
                onChange={onChange}
                value={[{ actionId: 'first-id', condition: 'ok' }]}
            />,
        )

        expect(screen.getByLabelText('Action')).toHaveTextContent('First label')
        fireEvent.mouseDown(screen.getByLabelText('Action'))
        fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Second label' }))
        expect(onChange).toHaveBeenLastCalledWith([{ actionId: 'second-id', condition: 'ok' }])

        view.unmount()
        renderNode(
            <ActionOnRulesEditor
                actions={actions}
                onChange={() => {}}
                value={[{ actionId: 'removed-id', condition: 'ok' }]}
            />,
        )
        expect(screen.getByLabelText('Action')).toHaveTextContent('removed-id — unavailable')
    })

    it('reorders and removes output rules', () => {
        const actions = [
            { id: 'first', label: 'First' },
            { id: 'second', label: 'Second' },
        ] as ActionDefinition[]
        const onChange = vi.fn()
        renderNode(
            <ActionOnRulesEditor
                actions={actions}
                onChange={onChange}
                value={[
                    { actionId: 'first', condition: 'first' },
                    { actionId: 'second', condition: 'second' },
                ]}
            />,
        )

        fireEvent.click(screen.getAllByRole('button', { name: 'Move output rule down' })[0])
        expect(onChange).toHaveBeenLastCalledWith([
            { actionId: 'second', condition: 'second' },
            { actionId: 'first', condition: 'first' },
        ])

        fireEvent.click(screen.getAllByRole('button', { name: 'Remove output rule' })[0])
        expect(onChange).toHaveBeenLastCalledWith([{ actionId: 'second', condition: 'second' }])
    })

    it('adds an empty output rule for the first available action id', () => {
        const actions = [{ id: 'first', label: 'First' }] as ActionDefinition[]
        const onChange = vi.fn()
        renderNode(<ActionOnRulesEditor actions={actions} onChange={onChange} value={[]} />)

        fireEvent.click(screen.getByRole('button', { name: 'Add output rule' }))

        expect(onChange).toHaveBeenCalledWith([{ actionId: 'first', condition: '' }])
    })

    it('keeps row actions mounted, focusable, tooltip-labeled, and narrow-safe', async () => {
        const actions = [
            { id: 'first', label: 'First' },
            { id: 'second', label: 'Second' },
        ] as ActionDefinition[]
        renderNode(
            <ActionLinkListEditor actions={actions} label="Before" onChange={() => {}} value={['first', 'second']} />,
        )
        const row = screen.getByRole('group', { name: 'Before action 1' })
        const rowActions = row.querySelector('.action-row-actions')
        const removeButton = within(row).getByRole('button', { name: 'Remove Before action' })

        expect(row).toHaveStyle({ display: 'grid', minWidth: 0 })
        expect(rowActions).toHaveStyle({ opacity: 0 })
        removeButton.focus()
        expect(removeButton).toHaveFocus()

        fireEvent.mouseOver(removeButton)
        expect(await screen.findByRole('tooltip', { name: 'Remove Before action' })).toBeVisible()
    })

    it('retains row-control focus after shared reorder and removal mechanics', async () => {
        const actions = [
            { id: 'first', label: 'First' },
            { id: 'second', label: 'Second' },
        ] as ActionDefinition[]

        function ControlledLinks() {
            const [value, setValue] = useState<string[] | undefined>(['first', 'second'])

            return <ActionLinkListEditor actions={actions} label="After" onChange={setValue} value={value} />
        }

        renderNode(<ControlledLinks />)
        const moveButton = screen.getAllByRole('button', { name: 'Move After action down' })[0]
        moveButton.focus()
        fireEvent.click(moveButton)
        await act(async () => undefined)

        expect(screen.getAllByRole('button', { name: 'Move After action down' })[1]).toHaveFocus()

        const removeButton = screen.getAllByRole('button', { name: 'Remove After action' })[0]
        removeButton.focus()
        fireEvent.click(removeButton)
        await act(async () => undefined)
        expect(screen.getByRole('button', { name: 'Remove After action' })).toHaveFocus()
    })
})
