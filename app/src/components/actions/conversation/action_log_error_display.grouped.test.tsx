import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActionRunLogEntry } from '../../../data/action_run_types'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionLogErrorDisplay } from './action_log_error_display'

function log(status: ActionRunLogEntry['status'], stderr = ''): ActionRunLogEntry {
    return {
        actionId: 'project-agent',
        actionName: 'Project agent',
        command: 'codex',
        message: status === 'failed' ? 'Project agent failed with exit code 1' : 'Project agent completed',
        phase: 'main',
        status,
        stderr,
        stdout: '',
    }
}

function renderDisplay(logs: ActionRunLogEntry[]) {
    return render(<AppThemeProvider><ActionLogErrorDisplay logs={logs} /></AppThemeProvider>)
}

describe('ActionLogErrorDisplay', () => {
    afterEach(cleanup)

    it('does not report stderr from a successful action as an error', () => {
        renderDisplay([log('completed', 'provider diagnostic')])

        expect(screen.queryByRole('button', { name: /failed action/u })).not.toBeInTheDocument()
    })

    it('shows a compact failed-action summary and keeps cleaned process output collapsed', () => {
        const escape = String.fromCharCode(27)
        renderDisplay([log('failed', `${escape}[31mERROR${escape}[0m\n${'detail '.repeat(200)}`)])

        fireEvent.click(screen.getByRole('button', { name: 'Show 1 failed action' }))

        expect(screen.getByText('1 failed action')).toBeInTheDocument()
        expect(screen.getByText('Project agent (main): Project agent failed with exit code 1')).toBeInTheDocument()
        expect(screen.queryByText(/detail detail/u)).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Show technical details' }))

        expect(screen.getByText(/ERROR\s+detail detail/u)).toBeInTheDocument()
        expect(screen.queryByText(new RegExp(escape, 'u'))).not.toBeInTheDocument()
    })
})
