import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentAccount } from '../../../../data/agent_accounts';
import type { ActionRunHistoryEntry } from '../../../../data/electron_action_bridge';
import { HistoryEntryRow } from './action_run_history_entry';

vi.mock('../../conversation/events/diff_view', () => ({ DiffView: ({ commitReference }: { commitReference: { commit: string } }) => <div>Diff {commitReference.commit}</div> }));

const COMPLETED_AT = '2026-07-05T10:00:00.000Z';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const NO_ACCOUNTS: AgentAccount[] = [];

function localizedTime(timestamp: string) {
    return new Date(timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function configuredAccounts(name: string): AgentAccount[] {
    return [{ agent: 'codex', configDirectory: 'C:/accounts/work', id: ACCOUNT_ID, kind: 'directory', name }];
}

describe('HistoryEntryRow', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders agent configuration fields in their fixed order', () => {
        const entry: ActionRunHistoryEntry = {
            accountId: ACCOUNT_ID,
            acknowledgedServiceTier: 'priority',
            agent: 'codex',
            completedAt: COMPLETED_AT,
            model: 'gpt-5',
            permissionMode: 'ask-for-approval',
            rootConversationId: 'conversation-1',
            startedAt: '2026-07-05T09:00:00.000Z',
            status: 'completed',
            thinkingLevel: 'high',
            type: 'agent',
        };

        render(<HistoryEntryRow accounts={configuredAccounts('Work')} entry={entry} />);

        expect(screen.getByText(`completed (codex / Work / gpt-5 / high / ask-for-approval / provider tier: priority) · ${localizedTime(COMPLETED_AT)}`)).toBeInTheDocument();
    });

    it('omits absent agent configuration fields', () => {
        const entry: ActionRunHistoryEntry = {
            agent: 'codex',
            completedAt: COMPLETED_AT,
            model: 'gpt-5',
            rootConversationId: 'conversation-1',
            startedAt: '2026-07-05T09:00:00.000Z',
            status: 'failed',
            type: 'agent',
        };

        render(<HistoryEntryRow accounts={NO_ACCOUNTS} entry={entry} />);

        expect(screen.getByText(`failed (codex / gpt-5) · ${localizedTime(COMPLETED_AT)}`)).toBeInTheDocument();
    });

    it('renders the current account name while retaining the persisted account ID', () => {
        const entry: ActionRunHistoryEntry = {
            accountId: ACCOUNT_ID,
            agent: 'codex',
            completedAt: COMPLETED_AT,
            rootConversationId: 'conversation-1',
            startedAt: '2026-07-05T09:00:00.000Z',
            status: 'completed',
            type: 'agent',
        };

        render(<HistoryEntryRow accounts={configuredAccounts('Renamed Work')} entry={entry} />);

        expect(screen.getByText(/completed \(codex \/ Renamed Work\)/u)).toBeInTheDocument();
        expect(entry).toMatchObject({ accountId: ACCOUNT_ID });
    });

    it('marks an account that is no longer configured as unavailable', () => {
        const entry: ActionRunHistoryEntry = {
            accountId: ACCOUNT_ID,
            agent: 'codex',
            completedAt: COMPLETED_AT,
            rootConversationId: 'conversation-1',
            startedAt: '2026-07-05T09:00:00.000Z',
            status: 'completed',
            type: 'agent',
        };

        render(<HistoryEntryRow accounts={NO_ACCOUNTS} entry={entry} />);

        expect(screen.getByText(`completed (codex / ${ACCOUNT_ID} — unavailable) · ${localizedTime(COMPLETED_AT)}`)).toBeInTheDocument();
    });

    it('renders command status, output, and completion time', () => {
        const entry: ActionRunHistoryEntry = {
            command: 'npm test',
            completedAt: COMPLETED_AT,
            output: 'all tests passed',
            startedAt: '2026-07-05T09:00:00.000Z',
            status: 'completed',
            type: 'command',
        };

        render(<HistoryEntryRow accounts={NO_ACCOUNTS} entry={entry} />);

        expect(screen.getByText(`completed: all tests passed · ${localizedTime(COMPLETED_AT)}`)).toBeInTheDocument();
    });

    it('shows commit date, performer, short hash, and independent diff toggles', () => {
        const firstCommittedAt = '2026-07-05T10:00:00.000Z';
        const secondCommittedAt = '2026-07-05T11:00:00.000Z';
        const entry: ActionRunHistoryEntry = {
            command: 'git commit',
            commits: [
                {
                    actionId: 'action-first', actionName: 'Prepare', branch: 'main', commit: 'abc123456789',
                    committedAt: firstCommittedAt, deletions: 0, filePaths: ['design/F-010.md'], filesChanged: 1,
                    insertions: 1, repositoryRoot: 'C:/repo',
                },
                {
                    actionId: 'action-second', actionName: 'Finish', branch: 'topic', commit: 'def567890123',
                    committedAt: secondCommittedAt, deletions: 1, filePaths: ['app/a.ts'], filesChanged: 1,
                    insertions: 0, repositoryRoot: 'C:/worktree',
                },
            ],
            completedAt: COMPLETED_AT,
            output: 'committed',
            startedAt: '2026-07-05T09:00:00.000Z',
            status: 'completed',
            type: 'command',
        };

        render(<HistoryEntryRow accounts={NO_ACCOUNTS} entry={entry} />);

        expect(screen.getByText(`${localizedTime(firstCommittedAt)} · Prepare · abc1234`)).toBeInTheDocument();
        expect(screen.getByText(`${localizedTime(secondCommittedAt)} · Finish · def5678`)).toBeInTheDocument();

        const showButtons = screen.getAllByRole('button', { name: 'Show diff' });
        fireEvent.click(showButtons[0]);
        expect(screen.getByText('Diff abc123456789')).toBeInTheDocument();
        expect(screen.queryByText('Diff def567890123')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Hide diff' }));
        expect(screen.queryByText('Diff abc123456789')).not.toBeInTheDocument();
    });
});
