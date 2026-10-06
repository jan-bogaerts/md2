import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentTokenUsage } from '../../data/data_types';
import { ProjectAgentUsageDetails } from './project_agent_usage_details';

const TOKEN_USAGE: AgentTokenUsage = {cachedInputTokens: 0, inputTokens: 16, outputTokens: 0, reasoningTokens: 0, totalTokens: 16};

describe('ProjectAgentUsageDetails', () => {
    afterEach(cleanup);

    it('shows reported costs beside tokens for project, Current, Archived, and ordered release rows without hover', () => {
        render(<ProjectAgentUsageDetails
            projectUsage={{ ...TOKEN_USAGE, costUsd: 1234.56 }}
            versions={[
                { name: 'Current', usage: { ...TOKEN_USAGE, costUsd: 0.0125 } },
                { name: 'Archived', usage: { ...TOKEN_USAGE, costUsd: 0.000001 } },
                { name: 'v1', usage: { ...TOKEN_USAGE, costUsd: 1.25 } },
                { name: 'v2', usage: { ...TOKEN_USAGE, costUsd: 2 } },
            ]}
        />);

        const projectHeading = screen.getByRole('heading', { name: 'Project agent usage' });
        expect(projectHeading.parentElement).toHaveTextContent('tokens: 16Reported cost: $1,234.56');
        const labels = ['Current', 'Archived', 'v1', 'v2'];
        const costs = ['Reported cost: $0.0125', 'Reported cost: $0.000001', 'Reported cost: $1.25', 'Reported cost: $2.00'];
        labels.forEach((label, index) => {
            const row = screen.getByText(label).parentElement;
            expect(row).toHaveTextContent(`tokens: 16${costs[index]}`);
        });
        expect(screen.getAllByText(/^(Current|Archived|v1|v2)$/u).map(({ textContent }) => textContent)).toEqual(labels);
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it.each([
        { costUsd: undefined, label: 'Cost: Data missing' },
        { costUsd: 0, label: 'Reported cost: $0.00' },
    ])('shows $label for project and every version row', ({ costUsd, label }) => {
        const usage = { ...TOKEN_USAGE, ...(costUsd === undefined ? {} : { costUsd }) };
        render(<ProjectAgentUsageDetails
            projectUsage={usage}
            versions={['Current', 'Archived', 'v1'].map((name) => ({ name, usage }))}
        />);

        expect(screen.getAllByText(label)).toHaveLength(4);
        expect(screen.getAllByText('tokens: 16')).toHaveLength(4);
    });

    it('keeps missing cost distinct from explicit zero in the same detail view', () => {
        render(<ProjectAgentUsageDetails
            projectUsage={TOKEN_USAGE}
            versions={[{ name: 'v1', usage: { ...TOKEN_USAGE, costUsd: 0 } }]}
        />);

        expect(screen.getByRole('heading', { name: 'Project agent usage' }).parentElement).toHaveTextContent('Cost: Data missing');
        const releaseRow = screen.getByText('v1').parentElement;
        expect(releaseRow).toHaveTextContent('Reported cost: $0.00');
        expect(screen.getByText('Reported cost: $0.00')).toBeVisible();
    });
});
