import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActionRunSettingsStore } from '../../../../services/actions/action_run_settings_service'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ActionRunDisabledMessage } from './action_run_disabled_message'

vi.mock('../../shared/use_action_run_settings', () => ({useActionRunSettings: vi.fn(() => ({ runDisabledMessage: null }))}))

const settingsStore = {} as ActionRunSettingsStore

function commandAction(command: string) {
    return {
        command,
        description: 'Command action',
        id: 'command',
        label: 'Command',
        phrases: [],
        type: 'command',
    } as unknown as ActionDefinition
}

describe('ActionRunDisabledMessage', () => {
    afterEach(cleanup)

    it.each(['', '   '])('explains that command text is required for %j', (command) => {
        render(
            <AppThemeProvider>
                <ActionRunDisabledMessage action={commandAction(command)} settingsStore={settingsStore} />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('note')).toHaveTextContent('Command text is required')
    })

    it('shows no definition message when command text contains non-whitespace text', () => {
        render(
            <AppThemeProvider>
                <ActionRunDisabledMessage action={commandAction(' npm test ')} settingsStore={settingsStore} />
            </AppThemeProvider>,
        )

        expect(screen.queryByRole('note')).not.toBeInTheDocument()
    })
})
