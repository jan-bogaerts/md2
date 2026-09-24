import { Box, Typography } from '@mui/material';
import type { DiagramCreationToolDefinition } from './diagram_creation_tools';
import { DiagramLegendConnectionSample } from '../legend/diagram_legend_connection_sample';
import { diagramRoleStyle } from '../formatting/diagram_role_style';

/** Uses diagram renderer visual language for one Add-menu tool. */
export function DiagramCreationToolSample({ definition }: { definition: DiagramCreationToolDefinition }) {
    if (definition.category === 'edge') return <DiagramLegendConnectionSample kind={definition.edgeKind} />;
    if (definition.category === 'node') {
        const circular = definition.definition.kind === 'root' || definition.definition.kind === 'topic';
        return (
            <Box
                aria-hidden="true"
                data-role={definition.role}
                sx={{ border: '1px solid', borderRadius: circular ? '50%' : 0.5, flexShrink: 0, height: circular ? 18 : 12, width: circular ? 18 : 20, ...diagramRoleStyle(definition.role) }}
            />
        );
    }
    if (definition.category === 'group') {
        return <Box aria-hidden="true" sx={{ border: '1px dashed', borderColor: 'custom.borderStrong', borderRadius: 0.5, height: 18, width: 28 }} />;
    }

    return (
        <Box aria-hidden="true" sx={{ bgcolor: 'action.hover', border: '1px solid', borderColor: 'custom.borderStrong', borderRadius: 0.5, height: 18, position: 'relative', width: 28 }}>
            <Typography sx={{ bgcolor: 'background.default', left: -1, lineHeight: 1, px: 0.25, position: 'absolute', top: -1 }} variant="overline">opt</Typography>
        </Box>
    );
}
