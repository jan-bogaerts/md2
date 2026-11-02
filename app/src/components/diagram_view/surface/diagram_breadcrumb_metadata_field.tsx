import { InputAdornment, TextField } from '@mui/material';
import { useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react';
import type { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service';
import type { MutableDiagramMetaField } from '../../../services/diagrams/diagram_edit_types';
import { useEditableDiagramMetadataField } from '../editing/use_editable_diagram';
import { DiagramRootMenuDropdownButton, type DiagramRootMenuService } from './diagram_root_menu_dropdown_button';

const ROOT_MENU_SELECTOR = '[role="menu"]';
const TITLE_MIN_WIDTH = 160;
const SUBTITLE_MIN_WIDTH = 240;

interface DiagramBreadcrumbMetadataFieldProps {
    field: MutableDiagramMetaField;
    rootMenuService?: DiagramRootMenuService;
    session: DiagramEditSessionService;
}

/** Edits the active diagram title or subtitle from the breadcrumb bar; writes only through the edit session. */
export function DiagramBreadcrumbMetadataField({ field, rootMenuService, session }: DiagramBreadcrumbMetadataFieldProps) {
    const value = useEditableDiagramMetadataField(field, session) ?? '';
    const [draftState, setDraftState] = useState({ base: value, value });
    const draft = draftState.base === value ? draftState.value : value;
    const [error, setError] = useState<string | null>(null);
    const isTitle = field === 'title';
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setDraftState({ base: value, value: event.target.value });
        setError(null);
    };
    const commit = () => {
        const trimmed = draft.trim();
        if (trimmed === value) return;
        if (!trimmed) {
            setError(`${isTitle ? 'Title' : 'Subtitle'} is required.`);

            return;
        }
        if (!session.objects.setMetadataField(field, trimmed)) setError(`${isTitle ? 'Title' : 'Subtitle'} could not be saved.`);
    };
    const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
        const nextFocus = event.relatedTarget instanceof Element ? event.relatedTarget : null;
        if (rootMenuService && nextFocus?.closest(ROOT_MENU_SELECTOR)) return;
        commit();
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            setDraftState({ base: value, value });
            setError(null);

            return;
        }
        if (event.key !== 'Enter' || (!isTitle && !event.ctrlKey)) return;
        event.preventDefault();
        commit();
    };
    const endAdornment = rootMenuService ? (
        <InputAdornment position="end"><DiagramRootMenuDropdownButton service={rootMenuService} /></InputAdornment>
    ) : undefined;

    return (
        <TextField
            error={!!error}
            helperText={error}
            multiline={!isTitle}
            onBlur={handleBlur}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            size="small"
            slotProps={{
                htmlInput: { 'aria-label': isTitle ? 'Diagram title' : 'Diagram subtitle' },
                input: { endAdornment },
            }}
            sx={{ minWidth: isTitle ? TITLE_MIN_WIDTH : SUBTITLE_MIN_WIDTH }}
            value={draft}
            variant="standard"
        />
    );
}
