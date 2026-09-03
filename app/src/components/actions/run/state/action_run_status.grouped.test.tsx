import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ActionRunLogEntry } from '../../../../data/action_run_types'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ActionRunStatus } from './action_run_status'

describe('ActionRunStatus', () => {
    it('renders one provider-independent permission mode', () => {
        const logs: ActionRunLogEntry[] = [{
            actionId: 'review',
            actionName: 'Review',
            command: null,
            message: 'Review completed',
            permissionMode: 'approve-for-me',
            phase: 'main',
            status: 'completed',
            stderr: '',
            stdout: '',
        }]

        render(
            <AppThemeProvider>
                <ActionRunStatus color="success.main" logs={logs} status="completed" />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('status')).toHaveTextContent('permissions: approve-for-me')
    })
})
