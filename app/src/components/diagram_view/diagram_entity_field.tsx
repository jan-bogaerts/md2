import { Typography } from '@mui/material'
import type { DiagramEntityField } from '../../services/diagrams/diagram_data'

interface DiagramEntityFieldProps {
    field: DiagramEntityField
}

function fieldPrefix(key: DiagramEntityField['key']) {
    if (key === 'primary') return '# '
    if (key === 'foreign') return '→ '

    return ''
}

/** Renders one entity field in its owning entity node. */
export function DiagramEntityFieldRow({ field }: DiagramEntityFieldProps) {
    return (
        <Typography sx={{ fontFamily: 'monospace' }} variant="caption">
            {fieldPrefix(field.key)}{field.name}{field.type ? `: ${field.type}` : ''}
        </Typography>
    )
}
