import { Typography } from '@mui/material'
import type { DiagramEntityField, DiagramFontFormatting } from '../../services/diagrams/diagram_data'
import { diagramFontStyle } from './diagram_font_style'

interface DiagramEntityFieldProps {
    field: DiagramEntityField
    fontFormatting?: DiagramFontFormatting
    fontScalePercent?: number
}

function fieldPrefix(key: DiagramEntityField['key']) {
    if (key === 'primary') return '# '
    if (key === 'foreign') return '→ '

    return ''
}

/** Renders one entity field in its owning entity node. */
export function DiagramEntityFieldRow({ field, fontFormatting, fontScalePercent = 100 }: DiagramEntityFieldProps) {
    return (
        <Typography
            sx={{ ...diagramFontStyle(fontFormatting, fontScalePercent, 'caption'), fontFamily: fontFormatting?.family ?? 'monospace' }}
            variant="caption"
        >
            {fieldPrefix(field.key)}{field.name}{field.type ? `: ${field.type}` : ''}
        </Typography>
    )
}
