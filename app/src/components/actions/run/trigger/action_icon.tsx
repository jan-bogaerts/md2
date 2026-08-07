import { Box } from '@mui/material'
import type { SvgIconProps } from '@mui/material'
import Play from 'mdi-material-ui/Play'
import type { ActionIconSource } from './action_icon_resolver'

interface ActionIconProps extends SvgIconProps {
    source: ActionIconSource
}

export function ActionIcon(props: ActionIconProps) {
    const { source, ...iconProps } = props
    if (!source.dataUri) return <Play {...iconProps} />

    return (
        <Box
            alt=""
            component="img"
            src={source.dataUri}
            sx={{ display: 'block', height: '1em', width: '1em' }}
        />
    )
}
