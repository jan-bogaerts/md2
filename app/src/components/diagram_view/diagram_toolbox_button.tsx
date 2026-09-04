import { Button, Tooltip } from '@mui/material';

interface DiagramToolboxButtonProps {
    active?: boolean;
    disabled?: boolean;
    label: string;
    onActivate: () => void;
    tooltip: string;
}

/** Accessible toolbox action whose visible label and tooltip describe its operation. */
export function DiagramToolboxButton({
    active,
    disabled = false,
    label,
    onActivate,
    tooltip,
}: DiagramToolboxButtonProps) {
    return (
        <Tooltip title={tooltip}>
            <span>
                <Button
                    aria-label={label}
                    aria-pressed={active}
                    disabled={disabled}
                    onClick={onActivate}
                    size="small"
                    variant={active ? 'contained' : 'outlined'}
                >
                    {label}
                </Button>
            </span>
        </Tooltip>
    );
}
