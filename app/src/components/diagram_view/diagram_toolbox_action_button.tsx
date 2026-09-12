import type { ReactNode } from 'react';
import { MenuIconButton } from '../shell/menu/menu_icon_button';

interface DiagramToolboxActionButtonProps {
    children: ReactNode;
    disabled?: boolean;
    label: string;
    onActivate: () => void;
    tooltip: string;
}

/** One-shot action button that cannot expose persistent pressed state. */
export function DiagramToolboxActionButton(props: DiagramToolboxActionButtonProps) {
    const { children, disabled, label, onActivate, tooltip } = props;

    return (
        <MenuIconButton disabled={disabled} label={label} onClick={onActivate} tooltip={tooltip}>
            {children}
        </MenuIconButton>
    );
}
