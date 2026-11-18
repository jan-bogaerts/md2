import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import type { MouseEvent } from 'react';
import type { DiffViewType } from '../../../../services/config/config_service';
import { setDiffViewType } from '../../../../services/config/diff_view_config';
import { dialogService } from '../../../../services/dialog_service';
import { useConfigValue } from '../../../hooks/use_config_value';

/** Selects and persists the layout shared by every diff viewer. */
export function DiffViewModeControl() {
    const viewType = useConfigValue('desktop.diffViewType');
    const handleChange = (_event: MouseEvent<HTMLElement>, nextViewType: DiffViewType | null) => {
        if (!nextViewType || nextViewType === viewType) return;
        void setDiffViewType(nextViewType).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not save diff view' });
        });
    };

    return (
        <ToggleButtonGroup aria-label="Diff view" exclusive onChange={handleChange} size="small" value={viewType}>
            <ToggleButton value="split">Split</ToggleButton>
            <ToggleButton value="unified">Unified</ToggleButton>
        </ToggleButtonGroup>
    );
}
