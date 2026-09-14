import type { Theme } from '@mui/material'
import type { DiagramFontFormatting } from '../../services/diagrams/diagram_data'

type DiagramTypographyVariant = 'body2' | 'caption' | 'h6' | 'overline'

function cssFontSize(value: number | string) {
    return typeof value === 'number' ? `${value}px` : value
}

/** Resolves optional category font values over one theme typography variant and diagram-wide scale. */
export function diagramFontStyle(
    formatting: DiagramFontFormatting | undefined,
    scalePercent: number,
    variant: DiagramTypographyVariant,
) {
    return {
        ...(formatting?.color ? { color: formatting.color } : {}),
        ...(formatting?.family ? { fontFamily: formatting.family } : {}),
        fontSize: (theme: Theme) => {
            const base = formatting?.size ?? theme.typography[variant].fontSize ?? '1rem'

            return `calc(${cssFontSize(base)} * ${scalePercent / 100})`
        },
        ...(formatting?.bold === undefined ? {} : { fontWeight: formatting.bold ? 700 : 400 }),
        ...(formatting?.italic === undefined ? {} : { fontStyle: formatting.italic ? 'italic' : 'normal' }),
        ...(formatting?.underline === undefined ? {} : { textDecoration: formatting.underline ? 'underline' : 'none' }),
    }
}
