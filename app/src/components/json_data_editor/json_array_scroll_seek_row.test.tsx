import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonArrayScrollSeekRow } from './json_array_scroll_seek_row';

describe('JsonArrayScrollSeekRow', () => {
    afterEach(cleanup);

    it('renders one native placeholder cell with measured height and full column span', () => {
        const { container } = render(
            <table>
                <tbody>
                    <JsonArrayScrollSeekRow
                        context={{ columns: ['id', 'name', 'active'] }}
                        height={53}
                        index={20}
                        type="item"
                    />
                </tbody>
            </table>,
        );
        const row = container.querySelector('tr');
        const cell = container.querySelector('td');

        expect(row).toHaveAttribute('aria-hidden', 'true');
        expect(row).toHaveStyle({ height: '53px' });
        expect(cell).toHaveAttribute('colspan', '4');
        expect(cell).toHaveStyle({ height: '53px', padding: '0px' });
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(container.querySelector('[class*="Mui"]')).not.toBeInTheDocument();
    });
});
