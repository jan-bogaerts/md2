import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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
})
