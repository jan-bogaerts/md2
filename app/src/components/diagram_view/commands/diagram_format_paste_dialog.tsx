import {
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    FormGroup,
} from '@mui/material';
import { useEffect, useSyncExternalStore, type ChangeEvent, type FormEvent } from 'react';
import {
    diagramFormatPasteService,
    type DiagramFormatPasteService,
} from '../../../services/diagrams/diagram_format_paste_service';
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service';
import {
    diagramSelectionService,
    type DiagramSelectionService,
} from '../../../services/diagrams/diagram_selection_service';

interface DiagramFormatPasteDialogProps {
    formatPaste?: DiagramFormatPasteService;
    selection?: Pick<DiagramSelectionService, 'getSelectionSnapshot' | 'subscribeSelection'>;
    session?: DiagramEditSessionService;
}

/** Selects copied semantic fields before one atomic Format Paste apply. */
export function DiagramFormatPasteDialog({
    formatPaste = diagramFormatPasteService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: DiagramFormatPasteDialogProps) {
    const open = useSyncExternalStore(
        formatPaste.subscribeDialogOpen,
        formatPaste.getDialogOpenSnapshot,
        formatPaste.getDialogOpenSnapshot,
    );
    const source = useSyncExternalStore(
        formatPaste.subscribeSource,
        formatPaste.getSourceSnapshot,
        formatPaste.getSourceSnapshot,
    );
    const options = useSyncExternalStore(
        formatPaste.subscribeDialogOptions,
        formatPaste.getDialogOptionsSnapshot,
        formatPaste.getDialogOptionsSnapshot,
    );
    const selectedObjects = useSyncExternalStore(
        selection.subscribeSelection,
        selection.getSelectionSnapshot,
        selection.getSelectionSnapshot,
    );
    const editSession = useSyncExternalStore(
        session.read.subscribeSession,
        session.read.getSessionSnapshot,
        session.read.getSessionSnapshot,
    );
    useEffect(() => {
        if (!editSession) formatPaste.closeDialog();
    }, [editSession, formatPaste]);

    const handleClose = () => { formatPaste.closeDialog(); };
    const handleLegendChange = (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
        formatPaste.setDialogOption('legend', checked);
    };
    const handleKindChange = (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
        formatPaste.setDialogOption('kind', checked);
    };
    const handleLabelChange = (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
        formatPaste.setDialogOption('label', checked);
    };
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (formatPaste.apply(selectedObjects, options, session)) formatPaste.closeDialog();
    };
    const hasOption = options.legend
        || (source?.kind !== undefined && options.kind)
        || (source?.label !== undefined && options.label);

    return (
        <Dialog fullWidth maxWidth="xs" onClose={handleClose} open={open && !!source && !!editSession}>
            <DialogTitle>Format Paste</DialogTitle>
            <form onSubmit={handleSubmit}>
                <DialogContent dividers>
                    <FormGroup>
                        <FormControlLabel control={<Checkbox checked={options.legend} onChange={handleLegendChange} />} label="Legend" />
                        {source?.kind !== undefined ? (
                            <FormControlLabel control={<Checkbox checked={options.kind} onChange={handleKindChange} />} label="Kind" />
                        ) : null}
                        {source?.label !== undefined ? (
                            <FormControlLabel control={<Checkbox checked={options.label} onChange={handleLabelChange} />} label="Label" />
                        ) : null}
                    </FormGroup>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end' }}>
                    <Button onClick={handleClose}>Cancel</Button>
                    <Button disabled={!hasOption} type="submit" variant="contained">Apply</Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
