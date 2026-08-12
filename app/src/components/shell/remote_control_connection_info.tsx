import { Box, Button, Link, Popover, Stack, Typography } from '@mui/material'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import type { RemoteControlStatus } from '../../data/electron_remote_control_bridge'
import { connectUrlFromEndpoint } from '../../data/remote_connect_string'

interface RemoteControlConnectionInfoProps {
    anchorEl: HTMLElement | null
    onClose: () => void
    open: boolean
    status: RemoteControlStatus
}

interface ConnectTarget {
    connectUrl: string
    endpoint: string
    label: string
}

/**
 * Connect targets to share, IP first: `.local` mDNS resolves unreliably on Android, so a raw LAN IP is
 * the dependable default.
 */
function connectTargets(status: RemoteControlStatus): ConnectTarget[] {
    const targets: ConnectTarget[] = []
    for (const ip of status.ipEndpoints ?? []) {
        const connectUrl = connectUrlFromEndpoint(ip)
        if (connectUrl) targets.push({ connectUrl, endpoint: ip, label: 'IP address' })
    }
    if (status.hostnameEndpoint) {
        const connectUrl = connectUrlFromEndpoint(status.hostnameEndpoint)
        if (connectUrl) targets.push({ connectUrl, endpoint: status.hostnameEndpoint, label: 'Hostname' })
    }

    return targets
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

/** Popover shown from the Serve button: hostname/IP connect links, a copy button and a QR of the selected link. */
export function RemoteControlConnectionInfo(props: RemoteControlConnectionInfoProps) {
    const { anchorEl, onClose, open, status } = props
    const targets = useMemo(() => connectTargets(status), [status])
    const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
    const [qrCode, setQrCode] = useState<{ connectUrl: string, dataUrl: string } | null>(null)
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

    // Default the QR/copy target to the first (IP) entry; re-pin if the endpoint set changes.
    const activeUrl = targets.some((target) => target.connectUrl === selectedUrl)
        ? selectedUrl
        : (targets[0]?.connectUrl ?? null)
    const qrDataUrl = qrCode?.connectUrl === activeUrl ? qrCode.dataUrl : null
    const copied = copiedUrl === activeUrl

    useEffect(() => {
        if (!activeUrl) return undefined

        let active = true
        void QRCode.toDataURL(activeUrl, { margin: 1, width: 176 }).then(
            (url) => {
                if (active) setQrCode({ connectUrl: activeUrl, dataUrl: url })
            },
            () => {
                if (active) setQrCode(null)
            },
        )

        return () => {
            active = false
        }
    }, [activeUrl])

    const handleCopy = async () => {
        if (!activeUrl) return
        await copyText(activeUrl)
        setCopiedUrl(activeUrl)
    }

    const handleCopyClick = () => void handleCopy()

    return (
        <Popover
            anchorEl={anchorEl}
            anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
            onClose={onClose}
            open={open}
        >
            <Stack spacing={1.5} sx={{ maxWidth: 280, p: 2 }}>
                {targets.length > 0 ? (
                    <Box>
                        <Typography variant="overline">Open on your phone</Typography>
                        <Typography color="text.secondary" variant="caption">
                            IP is most reliable; hostname (.local) may not resolve on Android.
                        </Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                            {targets.map((target) => (
                                <Link
                                    key={target.connectUrl}
                                    component="button"
                                    onClick={() => setSelectedUrl(target.connectUrl)}
                                    sx={{
                                        fontWeight: target.connectUrl === activeUrl ? 600 : 400,
                                        textAlign: 'left',
                                        wordBreak: 'break-all',
                                    }}
                                    type="button"
                                    variant="body2"
                                >
                                    {target.connectUrl}
                                </Link>
                            ))}
                        </Stack>
                    </Box>
                ) : (
                    <Typography variant="body2">—</Typography>
                )}
                {qrDataUrl ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <img alt="Remote-control connect QR code" src={qrDataUrl} style={{ maxWidth: '100%' }} />
                    </Box>
                ) : null}
                <Button disabled={!activeUrl} onClick={handleCopyClick} size="small" variant="outlined">
                    {copied ? 'Copied' : 'Copy connect link'}
                </Button>
            </Stack>
        </Popover>
    )
}
