import { Box, Button, Popover, Stack, Typography } from '@mui/material'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import type { RemoteControlStatus } from '../../data/electron_remote_control_bridge'
import { connectUrlFromEndpoint } from '../../data/remote_connect_string'

interface RemoteControlConnectionInfoProps {
    anchorEl: HTMLElement | null
    onClose: () => void
    open: boolean
    status: RemoteControlStatus
}

/** Primary endpoint to share: the mDNS hostname when available, else whatever the server reported. */
function primaryEndpoint(status: RemoteControlStatus) {
    return status.hostnameEndpoint ?? status.endpoint
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text)
    } catch {
        // Non-secure contexts lack the async clipboard API; fall back to a hidden textarea + execCommand.
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
    }
}

/** Popover shown from the Accept button: hostname/IP endpoints, a copy button and a QR of the connect URL. */
export function RemoteControlConnectionInfo(props: RemoteControlConnectionInfoProps) {
    const { anchorEl, onClose, open, status } = props
    const endpoint = primaryEndpoint(status)
    const connectUrl = endpoint && status.token ? connectUrlFromEndpoint(endpoint, status.token) : null
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        setCopied(false)
        if (!connectUrl) {
            setQrDataUrl(null)
            return undefined
        }

        let active = true
        void QRCode.toDataURL(connectUrl, { margin: 1, width: 176 }).then(
            (url) => {
                if (active) setQrDataUrl(url)
            },
            () => {
                if (active) setQrDataUrl(null)
            },
        )

        return () => {
            active = false
        }
    }, [connectUrl])

    const handleCopy = async () => {
        if (!connectUrl) return
        await copyText(connectUrl)
        setCopied(true)
    }

    return (
        <Popover
            anchorEl={anchorEl}
            anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
            onClose={onClose}
            open={open}
        >
            <Stack spacing={1.5} sx={{ maxWidth: 280, p: 2 }}>
                <Box>
                    <Typography variant="overline">Hostname</Typography>
                    <Typography sx={{ wordBreak: 'break-all' }} variant="body2">{endpoint ?? '—'}</Typography>
                </Box>
                {status.ipEndpoints && status.ipEndpoints.length > 0 ? (
                    <Box>
                        <Typography variant="overline">IP address fallback</Typography>
                        {status.ipEndpoints.map((ip) => (
                            <Typography key={ip} sx={{ wordBreak: 'break-all' }} variant="body2">{ip}</Typography>
                        ))}
                    </Box>
                ) : null}
                {qrDataUrl ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <img alt="Remote-control connect QR code" src={qrDataUrl} style={{ maxWidth: '100%' }} />
                    </Box>
                ) : null}
                <Button disabled={!connectUrl} onClick={() => void handleCopy()} size="small" variant="outlined">
                    {copied ? 'Copied' : 'Copy connect link'}
                </Button>
            </Stack>
        </Popover>
    )
}
