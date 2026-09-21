const SHORT_HEX_LENGTH = 4
const FULL_HEX_LENGTH = 7
const HEX_RADIX = 16
const MAX_CHANNEL_VALUE = 255
const LOW_CHANNEL_THRESHOLD = 0.03928
const LOW_CHANNEL_DIVISOR = 12.92
const CHANNEL_OFFSET = 0.055
const CHANNEL_DIVISOR = 1.055
const CHANNEL_EXPONENT = 2.4
const RED_WEIGHT = 0.2126
const GREEN_WEIGHT = 0.7152
const BLUE_WEIGHT = 0.0722
const READABLE_LUMINANCE_THRESHOLD = 0.5
const DARK_TEXT_COLOR = '#000000'
const LIGHT_TEXT_COLOR = '#ffffff'

function channelLuminance(channel: number) {
    const ratio = channel / MAX_CHANNEL_VALUE

    return ratio <= LOW_CHANNEL_THRESHOLD
        ? ratio / LOW_CHANNEL_DIVISOR
        : ((ratio + CHANNEL_OFFSET) / CHANNEL_DIVISOR) ** CHANNEL_EXPONENT
}

function hexChannels(color: string) {
    if (color.length === SHORT_HEX_LENGTH) {
        return [color[1]!, color[2]!, color[3]!].map((digit) => parseInt(`${digit}${digit}`, HEX_RADIX))
    }
    if (color.length === FULL_HEX_LENGTH) {
        return [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)].map((pair) => parseInt(pair, HEX_RADIX))
    }

    return null
}

/**
 * Black or white text, whichever stays readable on the given accent colour.
 * Colours this cannot parse fall back to dark text instead of throwing while rendering.
 */
export function readableTextColor(color: string) {
    const channels = color.startsWith('#') ? hexChannels(color) : null
    if (!channels || channels.some((channel) => !Number.isFinite(channel))) return DARK_TEXT_COLOR
    const [red, green, blue] = channels as [number, number, number]
    const luminance = RED_WEIGHT * channelLuminance(red)
        + GREEN_WEIGHT * channelLuminance(green)
        + BLUE_WEIGHT * channelLuminance(blue)

    return luminance > READABLE_LUMINANCE_THRESHOLD ? DARK_TEXT_COLOR : LIGHT_TEXT_COLOR
}

/** Styling for a config button that shows a configured accent colour as its background. */
export function colorSwatchButtonSx(color: string) {
    return {
        '&:hover': { bgcolor: color, filter: 'brightness(0.92)' },
        bgcolor: color,
        borderColor: 'divider',
        color: readableTextColor(color),
        textTransform: 'none',
    }
}
