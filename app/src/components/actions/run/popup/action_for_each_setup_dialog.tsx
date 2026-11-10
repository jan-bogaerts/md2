import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Select, Stack, TextField, Typography, type SelectChangeEvent } from '@mui/material';
import { useState, type ChangeEvent } from 'react';
import { forEachRecords } from '../../../../../../shared/action_for_each.mjs';
import type { ActionForEachConfig } from '../../../../data/action_run_types';
import { dialogService } from '../../../../services/dialog_service';

const MODE_OPTIONS: readonly { label: string; value: ActionForEachConfig['mode'] }[] = [
    { label: 'Add prompt', value: 'addPrompt' },
    { label: 'Compact', value: 'compact' },
    { label: 'New conversation', value: 'newConversation' },
];
const FAILURE_POLICY_OPTIONS: readonly { label: string; value: ActionForEachConfig['failurePolicy'] }[] = [
    { label: 'Log and continue', value: 'logAndContinue' },
    { label: 'Stop on first failure', value: 'stopOnFirstFailure' },
];
const INVALID_DATA_PATH_MESSAGE = 'For-each data path is invalid';
const INVALID_RECORDS_PER_BATCH_MESSAGE = `Records per batch must be a positive whole number no greater than ${Number.MAX_SAFE_INTEGER}`;
const INVALID_START_INDEX_MESSAGE = `Start index must be a non-negative whole number no greater than ${Number.MAX_SAFE_INTEGER}`;

interface ActionForEachSetupDialogProps {
    config: ActionForEachConfig;
    disabled: boolean;
    onCancel: () => void;
    onSave: (config: ActionForEachConfig) => void;
}

/** Stages for-each settings until Save; mount only while open so each open starts from the saved configuration. */
export function ActionForEachSetupDialog({ config, disabled, onCancel, onSave }: ActionForEachSetupDialogProps) {
    const [mode, setMode] = useState(config.mode);
    const [failurePolicy, setFailurePolicy] = useState(config.failurePolicy);
    const [dataPath, setDataPath] = useState(config.dataPath ?? '');
    const [recordsPerBatch, setRecordsPerBatch] = useState(String(config.recordsPerBatch ?? 1));
    const [startIndex, setStartIndex] = useState(String(config.startIndex ?? 0));
    const isRootObject = !!config.value && typeof config.value === 'object' && !Array.isArray(config.value);
    const showsRecordsPerBatch = mode === 'compact' || mode === 'newConversation';
    const handleModeChange = (event: SelectChangeEvent<ActionForEachConfig['mode']>) => setMode(event.target.value as ActionForEachConfig['mode']);
    const handleFailurePolicyChange = (event: SelectChangeEvent<ActionForEachConfig['failurePolicy']>) => (
        setFailurePolicy(event.target.value as ActionForEachConfig['failurePolicy'])
    );
    const handleDataPathChange = (event: ChangeEvent<HTMLInputElement>) => setDataPath(event.target.value);
    const handleRecordsPerBatchChange = (event: ChangeEvent<HTMLInputElement>) => setRecordsPerBatch(event.target.value);
    const handleStartIndexChange = (event: ChangeEvent<HTMLInputElement>) => setStartIndex(event.target.value);
    const handleSave = () => {
        const parsedRecordsPerBatch = Number(recordsPerBatch);
        if (recordsPerBatch.trim().length === 0 || !Number.isSafeInteger(parsedRecordsPerBatch) || parsedRecordsPerBatch <= 0) {
            dialogService.displayError(INVALID_RECORDS_PER_BATCH_MESSAGE);
            return;
        }
        const parsedStartIndex = Number(startIndex);
        if (startIndex.trim().length === 0 || !Number.isSafeInteger(parsedStartIndex) || parsedStartIndex < 0) {
            dialogService.displayError(INVALID_START_INDEX_MESSAGE);
            return;
        }
        const selector = isRootObject ? dataPath.trim() : '';
        try {
            forEachRecords(config.value, selector);
        } catch (error) {
            dialogService.displayError(error instanceof Error ? error.message : INVALID_DATA_PATH_MESSAGE);
            return;
        }
        const updated: ActionForEachConfig = {
            ...(selector.length > 0 ? { dataPath: selector } : {}),
            failurePolicy,
            fileName: config.fileName,
            mode,
            recordsPerBatch: parsedRecordsPerBatch,
            startIndex: parsedStartIndex,
            value: config.value,
        };
        onSave(updated);
    };

    return (
        <Dialog fullWidth maxWidth="xs" onClose={onCancel} open>
            <DialogTitle>For-each setup</DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" variant="caption">At end</Typography>
                        <Select disabled={disabled} inputProps={{ 'aria-label': 'At end' }} onChange={handleModeChange} size="small" value={mode}>
                            {MODE_OPTIONS.map(({ label, value }) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                        </Select>
                    </Stack>
                    {showsRecordsPerBatch ? (
                        <Stack spacing={0.75}>
                            <Typography color="text.secondary" variant="caption">Records per batch</Typography>
                            <TextField
                                disabled={disabled} fullWidth onChange={handleRecordsPerBatchChange} size="small" type="number"
                                slotProps={{ htmlInput: { 'aria-label': 'Records per batch', min: 1, step: 1 } }} value={recordsPerBatch}
                            />
                        </Stack>
                    ) : null}
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" variant="caption">On failure</Typography>
                        <Select disabled={disabled} inputProps={{ 'aria-label': 'On failure' }} onChange={handleFailurePolicyChange} size="small" value={failurePolicy}>
                            {FAILURE_POLICY_OPTIONS.map(({ label, value }) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                        </Select>
                    </Stack>
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" variant="caption">Start index</Typography>
                        <TextField
                            disabled={disabled} fullWidth onChange={handleStartIndexChange} size="small" type="number"
                            slotProps={{ htmlInput: { 'aria-label': 'Start index', min: 0, step: 1 } }} value={startIndex}
                        />
                    </Stack>
                    {isRootObject ? (
                        <Stack spacing={0.75}>
                            <Typography color="text.secondary" variant="caption">Path to list data</Typography>
                            <TextField
                                disabled={disabled} fullWidth onChange={handleDataPathChange} placeholder="countries.0.cities" size="small"
                                slotProps={{ htmlInput: { 'aria-label': 'Path to list data' } }} value={dataPath}
                            />
                        </Stack>
                    ) : null}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel}>Cancel</Button>
                <Button disabled={disabled} onClick={handleSave} variant="contained">Save</Button>
            </DialogActions>
        </Dialog>
    );
}
