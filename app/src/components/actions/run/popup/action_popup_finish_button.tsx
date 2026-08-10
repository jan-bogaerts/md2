import CheckOutlined from '@mui/icons-material/CheckOutlined'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Tooltip } from '@mui/material'
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

const LONG_PRESS_DURATION_MS = 500
const FINISH_TOOLTIP = 'Finish conversation. Ctrl+click or long press to stop sequence.'

interface ActionPopupFinishButtonProps {
    disabled: boolean
    onFinish: () => void
    onStop: () => void
}

/** Finishes one conversation, with deliberate alternate gestures for stopping its complete action sequence. */
export function ActionPopupFinishButton(props: ActionPopupFinishButtonProps) {
    const { disabled, onFinish, onStop } = props
    const [confirmationOpen, setConfirmationOpen] = useState(false)
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pointerIdRef = useRef<number | null>(null)
    const suppressClickRef = useRef(false)

    const clearLongPressTimer = () => {
        if (longPressTimerRef.current === null) return

        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
    }

    useEffect(() => clearLongPressTimer, [])

    const openConfirmation = () => setConfirmationOpen(true)
    const handleCloseConfirmation = () => setConfirmationOpen(false)

    const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return

        clearLongPressTimer()
        pointerIdRef.current = event.pointerId
        suppressClickRef.current = false
        event.currentTarget.setPointerCapture?.(event.pointerId)
        longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null
            suppressClickRef.current = true
            openConfirmation()
        }, LONG_PRESS_DURATION_MS)
    }

    const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (pointerIdRef.current !== event.pointerId) return

        clearLongPressTimer()
        pointerIdRef.current = null
        event.currentTarget.releasePointerCapture?.(event.pointerId)
    }

    const handlePointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (pointerIdRef.current !== event.pointerId) return

        clearLongPressTimer()
        pointerIdRef.current = null
        suppressClickRef.current = false
    }

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false
            event.preventDefault()
            return
        }
        if (event.ctrlKey) {
            openConfirmation()
            return
        }

        onFinish()
    }

    const handleStop = () => {
        setConfirmationOpen(false)
        onStop()
    }

    const handleContinue = () => {
        setConfirmationOpen(false)
        onFinish()
    }

    return (
        <>
            <Tooltip title={FINISH_TOOLTIP}>
                <span>
                    <IconButton
                        aria-label="Finish"
                        disabled={disabled}
                        onClick={handleClick}
                        onPointerCancel={handlePointerCancel}
                        onPointerDown={handlePointerDown}
                        onPointerUp={handlePointerUp}
                        size="small"
                    >
                        <CheckOutlined sx={{ fontSize: 18 }} />
                    </IconButton>
                </span>
            </Tooltip>
            <Dialog fullWidth maxWidth="xs" onClose={handleCloseConfirmation} open={confirmationOpen}>
                <DialogTitle>Stop action sequence?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Stop complete action sequence, including remaining next actions, or finish only this conversation
                        so sequence can continue?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button color="error" onClick={handleStop}>Stop sequence</Button>
                    <Button onClick={handleContinue} variant="contained">Continue sequence</Button>
                </DialogActions>
            </Dialog>
        </>
    )
}
