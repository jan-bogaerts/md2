import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatTokenCount, TokenCount } from './token_count'

/**
 * `formatTokenCount` formats in the user's default locale, so the decimal separator is whatever the
 * test machine reports. Expectations are written with a `.` and rewritten to the runtime separator.
 */
const DECIMAL_SEPARATOR = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
    .format(1.5)
    .replace(/\d/g, '')

function localized(expected: string) {
    return expected.replace('.', DECIMAL_SEPARATOR)
}

describe('formatTokenCount', () => {
    it.each([
        [0, '0'],
        [999, '999'],
        [1000, '1K'],
        [1234, '1.2K'],
        [15234, '15.2K'],
        [428913, '428.9K'],
        [999950, '1M'],
        [1000000, '1M'],
        [2000000, '2M'],
        [999999950, '1B'],
        [2500000000, '2.5B'],
        [-1284, '-1.3K'],
    ])('formats %i as %s', (value, expected) => {
        expect(formatTokenCount(value)).toBe(localized(expected))
    })

    it('never emits a trailing zero decimal', () => {
        for (const value of [1000, 999950, 1000000, 2000000, 999999950]) {
            expect(formatTokenCount(value)).not.toMatch(/[.,]0[A-Z]$/)
        }
    })
})

describe('TokenCount', () => {
    it('renders the abbreviated value and nothing else', () => {
        render(<TokenCount value={15234} />)

        expect(screen.getByText(localized('15.2K'))).toBeInTheDocument()
        expect(screen.queryByRole('tooltip')).toBeNull()
    })
})
