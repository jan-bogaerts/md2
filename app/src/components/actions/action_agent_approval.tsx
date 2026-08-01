import { Box, Button, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import type {
    AgentApprovalDecision,
    AgentCommandAction,
    AgentFileSystemPath,
} from '../../data/action_run_types'
import type { LiveAgentApproval } from '../../services/actions/action_run_registry'

const DEFAULT_APPROVAL_DECISIONS: AgentApprovalDecision[] = ['accept', 'acceptForSession', 'decline', 'cancel']

interface ActionAgentApprovalProps {
    approval: LiveAgentApproval
    onDecision: (requestId: number | string, decision: AgentApprovalDecision) => Promise<void>
}

function decisionLabel(decision: AgentApprovalDecision) {
    if (decision === 'accept') return 'Allow once'
    if (decision === 'acceptForSession') return 'Allow for session'
    if (decision === 'decline') return 'Decline'
    if (decision === 'cancel') return 'Stop turn'
    if ('acceptWithExecpolicyAmendment' in decision) return 'Allow with command policy'
    const { action, host } = decision.applyNetworkPolicyAmendment.network_policy_amendment

    return `${action === 'allow' ? 'Allow' : 'Deny'} ${host} for session`
}

function fileSystemPathLabel(path: AgentFileSystemPath) {
    if (path.type === 'path') return path.path
    if (path.type === 'glob_pattern') return path.pattern

    return path.value
}

function commandActionLabel(action: AgentCommandAction) {
    if (action.type === 'read') return `Read ${action.name}: ${action.path}`
    if (action.type === 'listFiles') return `List files${action.path ? `: ${action.path}` : ''}`
    if (action.type === 'search') {
        return `Search${action.query ? ` for ${action.query}` : ''}${action.path ? ` in ${action.path}` : ''}`
    }

    return action.command
}

function permissionLabels(approval: LiveAgentApproval) {
    const permissions = approval.additionalPermissions
    if (!permissions) return []
    const labels: string[] = []
    if (permissions.network?.enabled !== null && permissions.network?.enabled !== undefined) {
        labels.push(`Network: ${permissions.network.enabled ? 'enabled' : 'disabled'}`)
    }
    for (const path of permissions.fileSystem?.read ?? []) labels.push(`Read: ${path}`)
    for (const path of permissions.fileSystem?.write ?? []) labels.push(`Write: ${path}`)
    for (const entry of permissions.fileSystem?.entries ?? []) {
        labels.push(`${entry.access}: ${fileSystemPathLabel(entry.path)}`)
    }

    return labels
}

function approvalDetails(approval: LiveAgentApproval) {
    const details: { label: string, values: string[] }[] = []
    if (approval.command) details.push({ label: 'Command', values: [approval.command] })
    if (approval.cwd) details.push({ label: 'Working directory', values: [approval.cwd] })
    if (approval.environmentId) details.push({ label: 'Environment', values: [approval.environmentId] })
    if (approval.commandActions?.length) {
        details.push({ label: 'Actions', values: approval.commandActions.map(commandActionLabel) })
    }
    if (approval.networkApprovalContext) {
        const { host, protocol } = approval.networkApprovalContext
        details.push({ label: 'Network', values: [`${protocol}://${host}`] })
    }
    const permissions = permissionLabels(approval)
    if (permissions.length > 0) details.push({ label: 'Requested permissions', values: permissions })
    if (approval.grantRoot) details.push({ label: 'Requested write root', values: [approval.grantRoot] })
    if (approval.filePaths.length > 0) details.push({ label: 'Affected files', values: approval.filePaths })

    return details
}

/** Security context and exact provider decisions for one pending Codex approval. */
export function ActionAgentApproval({ approval, onDecision }: ActionAgentApprovalProps) {
    const [submitting, setSubmitting] = useState(false)
    const decisions = approval.availableDecisions ?? DEFAULT_APPROVAL_DECISIONS
    const disabled = submitting || approval.submitted
    const details = approvalDetails(approval)
    const handleDecisionClick = async (event: MouseEvent<HTMLButtonElement>) => {
        const decisionIndex = Number(event.currentTarget.dataset.decisionIndex)
        const decision = decisions[decisionIndex]
        if (!decision) throw new Error('Missing approval decision')
        setSubmitting(true)
        try {
            await onDecision(approval.requestId, decision)
        } catch {
            setSubmitting(false)
        }
    }

    return (
        <Stack aria-label="Agent approval" spacing={1.5} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
            <Stack spacing={0.5}>
                <Typography color="text.primary" variant="subtitle2">Approval required</Typography>
                {approval.reason ? <Typography color="text.secondary" variant="body2">{approval.reason}</Typography> : null}
            </Stack>
            {details.map(({ label, values }) => (
                <Stack key={label} spacing={0.25}>
                    <Typography color="text.secondary" variant="caption">{label}</Typography>
                    {values.map((value) => (
                        <Box
                            component="code"
                            key={value}
                            sx={{ color: 'text.primary', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                        >
                            {value}
                        </Box>
                    ))}
                </Stack>
            ))}
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {decisions.map((decision, index) => {
                    const label = decisionLabel(decision)
                    const destructive = decision === 'cancel'
                    const primary = decision === 'accept'

                    return (
                        <Button
                            color={destructive ? 'error' : 'primary'}
                            data-decision-index={index}
                            disabled={disabled}
                            key={`${index}-${label}`}
                            onClick={handleDecisionClick}
                            size="small"
                            variant={primary ? 'contained' : 'outlined'}
                        >
                            {label}
                        </Button>
                    )
                })}
            </Stack>
        </Stack>
    )
}
