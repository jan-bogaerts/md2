import type { DiagramRole } from '../../services/diagrams/diagram_data'

const DIAGRAM_ROLE_STYLES = {
    backend: { bgcolor: 'background.paper', borderColor: 'text.primary' },
    boundary: { bgcolor: 'background.default', borderColor: 'custom.borderStrong', borderStyle: 'dashed' },
    external: { bgcolor: 'action.hover', borderColor: 'divider' },
    focal: { bgcolor: 'custom.primaryBg', borderColor: 'primary.main' },
    input: { bgcolor: 'custom.primaryBg', borderColor: 'text.secondary' },
    optional: { bgcolor: 'background.paper', borderColor: 'divider', borderStyle: 'dashed' },
    store: { bgcolor: 'custom.track', borderColor: 'text.secondary' },
} as const

export function diagramRoleStyle(role: DiagramRole) {
    return DIAGRAM_ROLE_STYLES[role]
}
