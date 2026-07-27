import { Box } from '@mui/material'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { workspaceViewService } from '../../services/project/workspace_view_service'

interface MobileLayoutProps {
    content: ReactNode
}

/** Mobile body layout: a single panel that is only visible while the text view mode is active. */
export function MobileLayout(props: MobileLayoutProps) {
    const { content } = props
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const updateVisibility = () => {
            const container = containerRef.current
            if (!container) throw new Error('Missing mobile layout container')

            container.style.display = workspaceViewService.getSnapshot().viewMode === 'text' ? 'flex' : 'none'
        }

        updateVisibility()
        workspaceViewService.addEventListener('changed', updateVisibility)

        return () => workspaceViewService.removeEventListener('changed', updateVisibility)
    }, [])

    return (
        <Box ref={containerRef} sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
                {content}
            </Box>
        </Box>
    )
}
