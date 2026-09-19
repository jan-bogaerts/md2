const TIERS: { divisor: number, suffix: string }[] = [
    { divisor: 1_000, suffix: 'K' },
    { divisor: 1_000_000, suffix: 'M' },
    { divisor: 1_000_000_000, suffix: 'B' },
]

function abbreviated(mantissa: number, suffix: string) {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(mantissa)}${suffix}`
}

/** Abbreviates a token count for at-a-glance reading, promoting rounded values to the next suffix. */
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
