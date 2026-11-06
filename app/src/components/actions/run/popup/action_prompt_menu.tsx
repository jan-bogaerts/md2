import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined';
import CompressOutlined from '@mui/icons-material/CompressOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import AllInclusiveOutlined from '@mui/icons-material/AllInclusiveOutlined';
import { Badge, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type MouseEvent } from 'react';
import type { ActionContext } from '../../../../data/action_context';
import type { ActionForEachConfig, JsonValue } from '../../../../data/action_run_types';
import { getElectronActionBridge } from '../../../../data/electron_action_bridge';
import { generateUuid } from '../../../../data/uuid';
import { actionCompactService } from '../../../../services/actions/action_compact_service';
import type { ActionPromptDraft } from '../../../../services/actions/action_prompt_draft_service';
import { attachFilesToCardMarkdown, attachFilesToOriginalMarkdown } from '../../../../services/attachments/attachment_workflow';
import { dialogService } from '../../../../services/dialog_service';
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs';
import { useActionCompactRequests } from '../../../hooks/use_action_compact_requests';
import { resolveDisplayedConversation, type ActionConversationStore } from '../../conversation/state/action_conversation_store';
import type { ActionRunBindingStore } from '../state/action_run_binding_store';
import type { ActionRunInputStore } from '../state/action_run_input_store';
import { ActionForEachMenu } from './action_for_each_menu';

interface ActionPromptMenuProps {
    actionId: string;
    bindingStore: ActionRunBindingStore;
    context: ActionContext;
    conversationStore: ActionConversationStore;
    inputStore: ActionRunInputStore;
    promptDraft: ActionPromptDraft;
}

/** Owns prompt menu interaction, attachment picking, and captured compact targets. */
export function ActionPromptMenu({ actionId, bindingStore, context, conversationStore, inputStore, promptDraft }: ActionPromptMenuProps) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const forEachFileInput = useRef<HTMLInputElement>(null);
    const mounted = useRef(true);
    const boundRunId = useBoundRunId(bindingStore);
    const liveConversation = useRunSelector(boundRunId, (run) => run?.conversation ?? null);
    const liveProvider = useRunSelector(boundRunId, (run) => run?.agentProvider ?? null);
    const runStatus = useRunSelector(boundRunId, (run) => run?.status ?? null);
    const conversations = useSyncExternalStore(conversationStore.subscribe, conversationStore.getSnapshot, conversationStore.getSnapshot);
    const editor = useSyncExternalStore(promptDraft.subscribeEditor, promptDraft.getEditorSnapshot, promptDraft.getEditorSnapshot);
    const displayed = resolveDisplayedConversation(liveConversation, conversations.selectedConversation);
    const draftInput = useSyncExternalStore(inputStore.subscribe, inputStore.getSnapshot, inputStore.getSnapshot);
    const forEach = displayed?.forEach ?? draftInput.forEachByAction[actionId] ?? null;
    const loopRunning = runStatus === 'queued' || runStatus === 'running' || runStatus === 'waitingForInput';
    const conversationId = displayed?.id ?? null;
    const requests = useActionCompactRequests(conversationId);
    const queuedCount = requests.filter(({ state }) => state === 'queued').length;
    const compactRunning = requests.some(({ state }) => state === 'running');
    const openMenu = (event: MouseEvent<HTMLButtonElement>) => setAnchor(event.currentTarget);
    const closeMenu = () => setAnchor(null);
    const openFiles = () => {
        closeMenu();
        fileInput.current?.click();
    };
    const openForEachFile = () => {
        closeMenu();
        forEachFileInput.current?.click();
    };
    const saveForEach = async (config: ActionForEachConfig | null) => {
        if (displayed) {
            const bridge = getElectronActionBridge();
            if (!bridge?.updateActionConversationForEach) throw new Error('For-each persistence is not available');
            const updated = await bridge.updateActionConversationForEach(displayed.path, config);
            conversationStore.updateConversation(updated);
            return;
        }
        inputStore.setForEach(actionId, config);
    };
    const handleForEachFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        event.target.value = '';
        if (!file) return;
        try {
            if (!file.name.toLocaleLowerCase().endsWith('.json')) throw new Error('For-each file must be JSON');
            const value = JSON.parse(await file.text()) as JsonValue;
            const config: ActionForEachConfig = {
                failurePolicy: forEach?.failurePolicy ?? 'logAndContinue',
                fileName: file.name,
                mode: forEach?.mode ?? 'addPrompt',
                value,
            };
            await saveForEach(config);
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'For-each JSON could not be attached' });
        }
    };
    const changeForEach = (config: ActionForEachConfig) => {
        void saveForEach(config).catch((error: unknown) => dialogService.error(error, { fallbackMessage: 'For-each settings could not be saved' }));
    };
    const removeForEach = () => {
        void saveForEach(null).catch((error: unknown) => dialogService.error(error, { fallbackMessage: 'For-each data could not be removed' }));
    };
    const viewForEach = () => {
        if (!forEach) return;
        const bridge = getElectronActionBridge();
        if (!bridge?.viewActionForEachData) {
            dialogService.error(new Error('For-each viewing is not available'));
            return;
        }
        void bridge.viewActionForEachData(forEach.fileName, forEach.value)
            .catch((error: unknown) => dialogService.error(error, { fallbackMessage: 'For-each data could not be opened' }));
    };
    const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = '';
        if (files.length === 0) return;
        try {
            if (context.file) await attachFilesToCardMarkdown(context.file, files, promptDraft.requestInsertion);
            else await attachFilesToOriginalMarkdown(files, promptDraft.requestInsertion);
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Files could not be attached' });
        }
    };
    const compact = async () => {
        closeMenu();
        try {
            if (!displayed || !displayed.entries.some(({ kind }) => kind === 'message')) throw new Error('There is nothing to compact');
            const session = displayed.providerSessions.reduce<typeof displayed.providerSessions[number] | null>(
                (latest, candidate) => !latest || candidate.lastUsedAt > latest.lastUsedAt ? candidate : latest, null,
            );
            const provider = displayed.id === liveConversation?.id ? liveProvider ?? session?.agent : session?.agent;
            if (!provider) throw new Error('Missing provider session for compact');
            const request = {
                actionId, context: { ...context }, conversationId: displayed.id, provider,
                reference: displayed.path, requestId: generateUuid(),
            };
            const accepted = await actionCompactService.request(request);
            if (mounted.current && accepted?.runId && conversationStore.getSnapshot().selectedConversation?.id === request.conversationId) {
                await conversationStore.select(request.conversationId);
            }
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Compaction failed' });
        }
    };

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    return (
        <>
            {forEach ? (
                <ActionForEachMenu config={forEach} disabled={loopRunning} onChange={changeForEach}
                    onRemove={removeForEach} onView={viewForEach} />
            ) : null}
            <Tooltip title="Prompt menu">
                <IconButton
                    aria-expanded={!!anchor} aria-haspopup="menu" aria-label="Prompt menu"
                    onClick={openMenu} size="small" sx={{ flexShrink: 0 }}
                >
                    <Badge aria-label={queuedCount > 0 ? `${queuedCount} compact request${queuedCount === 1 ? '' : 's'} queued` : undefined}
                        badgeContent={queuedCount} color="primary">
                        <MoreVertOutlined sx={{ fontSize: 18 }} />
                    </Badge>
                </IconButton>
            </Tooltip>
            <Menu anchorEl={anchor} onClose={closeMenu} open={!!anchor}>
                <MenuItem disabled={compactRunning} onClick={compact}>
                    <ListItemIcon><CompressOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Compact" />
                </MenuItem>
                <MenuItem disabled={editor.preparationStatus !== 'ready'} onClick={openFiles}>
                    <ListItemIcon><AttachFileOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Add file" />
                </MenuItem>
                <MenuItem disabled={loopRunning} onClick={openForEachFile}>
                    <ListItemIcon><AllInclusiveOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText primary="For each" />
                </MenuItem>
            </Menu>
            <input aria-label="Add files" hidden multiple onChange={handleFiles} ref={fileInput} type="file" />
            <input accept=".json,application/json" aria-label="For-each JSON" hidden onChange={handleForEachFile} ref={forEachFileInput} type="file" />
        </>
    );
}
