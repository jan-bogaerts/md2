import { Box } from '@mui/material'
import Circle from 'mdi-material-ui/Circle'
import HelpCircleOutline from 'mdi-material-ui/HelpCircleOutline'
import type { ReactNode } from 'react'
import { MovableFab } from '../movable_fab'
import type { AgentFabState } from './agent_fab_state'

interface AgentFabPresentationProps {
    disabled?: boolean
    disabledLabel?: string
    icon: ReactNode
    labelPrefix: string
    onActivate: (anchorElement: HTMLElement) => void
    onDragStart?: () => void
    runningDescription?: 'Action is running' | 'Agent is running'
    state: AgentFabState
}

/** State-dependent presentation shared by movable agent launchers. */
export function AgentFabPresentation(props: AgentFabPresentationProps) {
    const {
        disabled = false, disabledLabel, icon, labelPrefix, onActivate, onDragStart,
        runningDescription = 'Action is running', state,
    } = props
    const stateDescription = state === 'queued'
        ? 'Action is queued'
        : state === 'running'
            ? runningDescription
            : state === 'waiting for input'
                ? 'Agent is waiting for input'
                : state === 'unseen result'
                    ? 'New agent result available'
                    : null
    const stateLabel = stateDescription ? `${labelPrefix} — ${stateDescription}` : labelPrefix
    const label = disabled && disabledLabel ? disabledLabel : stateLabel
    const isRunning = state === 'running'
    const isUnseen = state === 'unseen result'
    const isWaiting = state === 'waiting for input'

    return (
        <MovableFab
            ariaLabel={label}
            disabled={disabled}
            fabSx={(theme) => ({
                bgcolor: isWaiting ? 'warning.main' : isUnseen ? 'info.main' : undefined,
                isolation: 'isolate',
                overflow: 'visible',
                position: 'relative',
                ...(isRunning && {
                    '@keyframes md2-agent-run-spin': { to: { transform: 'rotate(1turn)' } },
                    '&::before': {
                        animation: 'md2-agent-run-spin 1s linear infinite',
                        background: `conic-gradient(from 0deg, ${theme.palette.primary.main}, transparent 55%)`,
                        borderRadius: '50%',
                        content: '""',
                        inset: -4,
                        pointerEvents: 'none',
                        position: 'absolute',
                        zIndex: -1,
                    },
                }),
            })}
            onActivate={onActivate}
            onDragStart={onDragStart}
            tooltip={label}
        >
            <Box component="span" sx={{ alignItems: 'center', display: 'inline-flex', position: 'relative' }}>
                {icon}
                {isWaiting ? (
                    <HelpCircleOutline sx={{ color: 'warning.contrastText', fontSize: 15, position: 'absolute', right: -9, top: -9 }} />
                ) : null}
                {isUnseen ? (
                    <Circle sx={{ color: 'info.contrastText', fontSize: 9, position: 'absolute', right: -7, top: -7 }} />
                ) : null}
            </Box>
        </MovableFab>
    )
}
