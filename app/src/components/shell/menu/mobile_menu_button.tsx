import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import { Badge, IconButton, Tooltip } from '@mui/material'
import Menu from 'mdi-material-ui/Menu'
import { useCodexRateLimits } from '../../hooks/use_codex_rate_limits'
import { useProjectPersistence } from '../../hooks/use_project_persistence'
import { useProjectSession } from '../../hooks/use_project_session'
import { codexRateLimitPresentation } from '../codex_rate_limit_status_data'
import { NO_DRAG_REGION } from '../drag_region'
import { useRemoteControlStatus } from '../use_remote_control_status'

interface MobileMenuButtonProps {
    onOpenMenu: () => void
}

/** Mobile hamburger button with live attention state isolated from toolbar rendering. */
export function MobileMenuButton({ onOpenMenu }: MobileMenuButtonProps) {
    const { hasPendingPush, hasPendingSave, localSaveState } = useProjectPersistence()
    const { isPushing } = useProjectSession()
    const codexPresentation = codexRateLimitPresentation(useCodexRateLimits())
    const { status: remoteControlStatus } = useRemoteControlStatus()
    const needsAttention = hasPendingSave
        || localSaveState !== 'saved'
        || hasPendingPush
        || isPushing
        || !!codexPresentation?.nearLimit
        || !!codexPresentation?.reached
        || remoteControlStatus.active

    return (
        <Tooltip title="Open menu">
            <IconButton aria-label="Open menu" edge="start" onClick={onOpenMenu} style={NO_DRAG_REGION} sx={{ mr: 1 }}>
                <Badge
                    badgeContent={needsAttention ? (
                        <WarningAmberOutlined
                            aria-hidden="true"
                            data-testid="mobile-menu-attention"
                            sx={{ fontSize: 12 }}
                        />
                    ) : null}
                    color="warning"
                    overlap="circular"
                    sx={{ '& .MuiBadge-badge': { height: 16, minWidth: 16, p: 0 } }}
                >
                    <Menu />
                </Badge>
            </IconButton>
        </Tooltip>
    )
}
