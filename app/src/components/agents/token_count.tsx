import { Box } from '@mui/material'

const TIERS: { divisor: number, suffix: string }[] = [
    { divisor: 1_000, suffix: 'K' },
    { divisor: 1_000_000, suffix: 'M' },
    { divisor: 1_000_000_000, suffix: 'B' },
]

interface TokenCountProps {
    value: number
}

function abbreviated(mantissa: number, suffix: string) {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(mantissa)}${suffix}`
}

/**
 * Abbreviates a token count for at-a-glance reading: `1234` becomes `1.2K`, `2000000` becomes `2M`.
 * Values below 1000 keep their exact integer form, and a trailing `.0` never appears because
 * `maximumFractionDigits` drops it. Rounding to one decimal can push the mantissa to 1000 (`999950`
 * would render as `1000.0K`), so in that carry case the value promotes to the next suffix and is
 * recomputed against the larger divisor. The locale is the user default, so above 1000 the only
 * locale-sensitive character is the decimal separator; below 1000 no separator appears at all.
 */
export function formatTokenCount(value: number): string {
    const magnitude = Math.abs(value)
    let tierIndex = -1
    for (let index = 0; index < TIERS.length; index += 1) {
        if (magnitude >= TIERS[index].divisor) tierIndex = index
    }
    if (tierIndex < 0) return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)

    const mantissa = value / TIERS[tierIndex].divisor
    const carries = Math.abs(Number(mantissa.toFixed(1))) >= 1_000
    if (carries && tierIndex < TIERS.length - 1) {
        const promoted = TIERS[tierIndex + 1]

        return abbreviated(value / promoted.divisor, promoted.suffix)
    }

    return abbreviated(mantissa, TIERS[tierIndex].suffix)
}

/** Inline abbreviated token count. Carries no tooltip; consuming surfaces own their own. */
export function TokenCount({ value }: TokenCountProps) {
    return <Box component="span">{formatTokenCount(value)}</Box>
}
