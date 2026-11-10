import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentAccount } from '../../../../data/agent_accounts';
import type { ActionRunHistoryEntry } from '../../../../data/electron_action_bridge';
import { configService } from '../../../../services/config/config_service';
import { dialogService } from '../../../../services/dialog_service';
import { DialogDisplay } from '../../../dialog_display';
import { ActionRunHistory } from './action_run_history';

function commandEntry(output: string, completedAt: string): ActionRunHistoryEntry {
    return { command: 'npm test', completedAt, output, startedAt: '2026-07-05T09:00:00.000Z', status: 'completed', type: 'command' };
}

describe('ActionRunHistory', () => {
    afterEach(() => {
        cleanup();
        configService.clear();
        vi.restoreAllMocks();
    });

    it('renders nothing when history is empty', () => {
        render(<ActionRunHistory entries={[]} error={null} />);

        expect(screen.queryByText('Run history')).not.toBeInTheDocument();
        expect(screen.queryByText('No previous runs')).not.toBeInTheDocument();
    });

    it('reports history load errors through the dialog display', async () => {
        render(
            <>
                <DialogDisplay />
                <ActionRunHistory entries={[]} error="Could not load run history" />
            </>,
        );

        expect(await screen.findByText('Could not load run history')).toBeInTheDocument();
        expect(screen.queryByText('Run history unavailable.')).not.toBeInTheDocument();
    });

    it('reports a repeated error once until history recovers', () => {
        const reportError = vi.spyOn(dialogService, 'error');
        const { rerender } = render(<ActionRunHistory entries={[]} error="Load failed" />);

        rerender(<ActionRunHistory entries={[]} error="Load failed" />);
        expect(reportError).toHaveBeenCalledTimes(1);

        rerender(<ActionRunHistory entries={[]} error={null} />);
        rerender(<ActionRunHistory entries={[]} error="Load failed" />);
        expect(reportError).toHaveBeenCalledTimes(2);
    });

    it('shows the unavailable notice beside entries when an error is present', () => {
        const entries = [commandEntry('previous output', '2026-07-05T10:00:00.000Z')];

        render(<ActionRunHistory entries={entries} error="Load failed" />);

        expect(screen.getByText('Run history')).toBeInTheDocument();
        expect(screen.getByText('Run history unavailable.')).toBeInTheDocument();
        expect(screen.getByText(/^completed: previous output/u)).toBeInTheDocument();
    });

    it('renders entries newest first', () => {
        const entries = [
            commandEntry('oldest output', '2026-07-05T10:00:00.000Z'),
            commandEntry('newest output', '2026-07-05T12:00:00.000Z'),
        ];

        render(<ActionRunHistory entries={entries} error={null} />);

        const summaries = screen.getAllByText(/^completed:/u);
        expect(summaries.map(({ textContent }) => textContent)).toEqual([
            expect.stringContaining('newest output'),
            expect.stringContaining('oldest output'),
        ]);
    });

    it('passes configured agent accounts to its entries', () => {
        const accountId = '11111111-1111-4111-8111-111111111111';
        const agentAccounts: AgentAccount[] = [
            { agent: 'codex', id: 'codex-initial', kind: 'initial', name: 'Default' },
            { agent: 'claude', id: 'claude-initial', kind: 'initial', name: 'Default' },
            { agent: 'codex', configDirectory: 'C:/accounts/work', id: accountId, kind: 'directory', name: 'Renamed Work' },
        ];
        configService.init({ desktopConfig: { agentAccounts } });
        const entries: ActionRunHistoryEntry[] = [{
            accountId,
            agent: 'codex',
            completedAt: '2026-07-05T10:00:00.000Z',
            rootConversationId: 'conversation-1',
            startedAt: '2026-07-05T09:00:00.000Z',
            status: 'completed',
            type: 'agent',
        }];

        render(<ActionRunHistory entries={entries} error={null} />);

        expect(screen.getByText(/completed \(codex \/ Renamed Work\)/u)).toBeInTheDocument();
    });
});
