import { Breadcrumbs, Button } from '@mui/material';
import type { JsonLocationSegment } from '../../services/json/json_types';

interface JsonBreadcrumbsProps {
    location: readonly JsonLocationSegment[];
    onNavigate: (depth: number) => void;
    path: string;
}

function segmentLabel(segment: JsonLocationSegment) {
    return typeof segment === 'number' ? `[${segment}]` : segment;
}

/** Exact navigation path from file root to current nested JSON value. */
export function JsonBreadcrumbs(props: JsonBreadcrumbsProps) {
    const { location, onNavigate, path } = props;
    const rootLabel = path.split('/').at(-1) ?? path;

    return (
        <Breadcrumbs aria-label="JSON path" sx={{ flexShrink: 0, px: 2, py: 1 }}>
            <Button onClick={() => onNavigate(0)} size="small" variant="text">{rootLabel}</Button>
            {location.map((segment, index) => (
                <Button
                    key={`${typeof segment}:${segment}:${index}`}
                    onClick={() => onNavigate(index + 1)}
                    size="small"
                    variant="text"
                >
                    {segmentLabel(segment)}
                </Button>
            ))}
        </Breadcrumbs>
    );
}
