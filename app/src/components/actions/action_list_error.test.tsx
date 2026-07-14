import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../../data/action_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionLinkListEditor } from './action_link_list_editor'
import { ActionOnRulesEditor } from './action_on_rules_editor'

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
    })
})
