import { DiagramToolboxButton } from './diagram_toolbox_button';

interface DiagramToolboxActionButtonProps {
    disabled?: boolean;
    label: string;
    onActivate: () => void;
    tooltip: string;
}

/** One-shot action button that cannot expose persistent pressed state. */
export function DiagramToolboxActionButton(props: DiagramToolboxActionButtonProps) {
    return <DiagramToolboxButton {...props} />;
}
