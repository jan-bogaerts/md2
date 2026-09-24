import FormatSizeOutlined from '@mui/icons-material/FormatSizeOutlined'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import {
    DIAGRAM_FORMATTING_SCALE_MAXIMUM,
    DIAGRAM_FORMATTING_SCALE_MINIMUM,
} from '../../../services/diagrams/diagram_data'
import {
    DIAGRAM_FORMATTING_SCALE_DEFAULT,
    DIAGRAM_FORMATTING_SCALE_STEP,
    type DiagramScaleField,
} from '../../../services/diagrams/diagram_formatting'
import { DiagramFormattingScaleControl } from './diagram_formatting_scale_control'

const POINTER_TEST_SLIDER_HEIGHT = 20
const POINTER_TEST_SLIDER_WIDTH = 200
const POINTER_TEST_CLICK_X = 80

function missingFormattingSnapshot() {
    return undefined
}

function subscribeToNothing() {
    return () => undefined
}

class FormattingStoreStub extends EventTarget {
    private values: Record<DiagramScaleField, number> = {
        boxScalePercent: DIAGRAM_FORMATTING_SCALE_DEFAULT,
        fontScalePercent: DIAGRAM_FORMATTING_SCALE_DEFAULT,
        spacingScalePercent: DIAGRAM_FORMATTING_SCALE_DEFAULT,
    }

    getConnectionKindFormattingSnapshot = missingFormattingSnapshot

    getFormattingScaleSnapshot = (field: DiagramScaleField) => this.values[field]

    getNodeRoleFormattingSnapshot = missingFormattingSnapshot

    setFormattingScale = (field: DiagramScaleField, value: number) => {
        this.values = { ...this.values, [field]: value }
        this.dispatchEvent(new Event(`formatting:${field}`))
    }

    subscribeConnectionKindFormatting = subscribeToNothing

    subscribeFormattingScale = (field: DiagramScaleField, listener: () => void) => {
        this.addEventListener(`formatting:${field}`, listener)

        return () => this.removeEventListener(`formatting:${field}`, listener)
    }

    subscribeNodeRoleFormatting = subscribeToNothing
}

function renderControl(store: FormattingStoreStub, surface: 'Current' | 'New' = 'Current') {
    render(
        <DiagramFormattingScaleControl
            field="fontScalePercent"
            icon={<FormatSizeOutlined fontSize="small" />}
            label="font size"
            store={store}
            surface={surface}
        />,
    )
}

afterEach(cleanup)

describe('DiagramFormattingScaleControl', () => {
    it('opens identified popover and applies direct and keyboard changes within configured bounds', async () => {
        const store = new FormattingStoreStub()
        const user = userEvent.setup()
        renderControl(store)

        await user.click(screen.getByRole('button', { name: 'Adjust Current font size' }))

        expect(screen.getByRole('dialog', { name: 'Current font size' })).toBeInTheDocument()
        const slider = screen.getByRole('slider', { name: 'Current font size percentage' })
        expect(slider).toHaveAttribute('aria-valuemin', String(DIAGRAM_FORMATTING_SCALE_MINIMUM))
        expect(slider).toHaveAttribute('aria-valuemax', String(DIAGRAM_FORMATTING_SCALE_MAXIMUM))
        expect(slider).toHaveAttribute('aria-valuetext', '100%')
        expect(slider).toHaveAttribute('step', String(DIAGRAM_FORMATTING_SCALE_STEP))

        const sliderRoot = slider.closest<HTMLElement>('.MuiSlider-root')
        if (!sliderRoot) throw new Error('Formatting slider root is missing')
        sliderRoot.hasPointerCapture = () => false
        sliderRoot.releasePointerCapture = () => undefined
        sliderRoot.setPointerCapture = () => undefined
        sliderRoot.getBoundingClientRect = () => ({
            bottom: POINTER_TEST_SLIDER_HEIGHT,
            height: POINTER_TEST_SLIDER_HEIGHT,
            left: 0,
            right: POINTER_TEST_SLIDER_WIDTH,
            toJSON: () => ({}),
            top: 0,
            width: POINTER_TEST_SLIDER_WIDTH,
            x: 0,
            y: 0,
        })
        fireEvent.pointerDown(sliderRoot, { button: 0, clientX: POINTER_TEST_CLICK_X, pointerId: 1 })
        fireEvent.pointerUp(document, { pointerId: 1 })
        expect(store.getFormattingScaleSnapshot('fontScalePercent')).toBe(110)
        expect(screen.getByLabelText('Current font size value')).toHaveTextContent('110%')

        slider.focus()
        await user.keyboard('{ArrowRight}')
        expect(store.getFormattingScaleSnapshot('fontScalePercent')).toBe(120)

        fireEvent.change(slider, { target: { value: String(DIAGRAM_FORMATTING_SCALE_MINIMUM) } })
        await user.keyboard('{ArrowLeft}')
        expect(store.getFormattingScaleSnapshot('fontScalePercent')).toBe(DIAGRAM_FORMATTING_SCALE_MINIMUM)

        fireEvent.change(slider, { target: { value: String(DIAGRAM_FORMATTING_SCALE_MAXIMUM) } })
        await user.keyboard('{ArrowRight}')
        expect(store.getFormattingScaleSnapshot('fontScalePercent')).toBe(DIAGRAM_FORMATTING_SCALE_MAXIMUM)
    })

    it('isolates Current and New stores', async () => {
        const currentStore = new FormattingStoreStub()
        const newStore = new FormattingStoreStub()
        const user = userEvent.setup()
        render(
            <>
                <DiagramFormattingScaleControl
                    field="fontScalePercent"
                    icon={<FormatSizeOutlined fontSize="small" />}
                    label="font size"
                    store={currentStore}
                    surface="Current"
                />
                <DiagramFormattingScaleControl
                    field="fontScalePercent"
                    icon={<FormatSizeOutlined fontSize="small" />}
                    label="font size"
                    store={newStore}
                    surface="New"
                />
            </>,
        )

        await user.click(screen.getByRole('button', { name: 'Adjust New font size' }))
        fireEvent.change(screen.getByRole('slider', { name: 'New font size percentage' }), { target: { value: '130' } })

        expect(newStore.getFormattingScaleSnapshot('fontScalePercent')).toBe(130)
        expect(currentStore.getFormattingScaleSnapshot('fontScalePercent')).toBe(DIAGRAM_FORMATTING_SCALE_DEFAULT)
    })

    it('keeps selected value and reads latest store value when reopened', async () => {
        const store = new FormattingStoreStub()
        const user = userEvent.setup()
        renderControl(store)
        const button = screen.getByRole('button', { name: 'Adjust Current font size' })

        await user.click(button)
        fireEvent.change(screen.getByRole('slider', { name: 'Current font size percentage' }), { target: { value: '140' } })
        await user.keyboard('{Escape}')
        expect(screen.queryByRole('dialog', { name: 'Current font size' })).not.toBeInTheDocument()
        expect(store.getFormattingScaleSnapshot('fontScalePercent')).toBe(140)

        store.setFormattingScale('fontScalePercent', 170)
        await user.click(button)

        expect(screen.getByRole('slider', { name: 'Current font size percentage' })).toHaveAttribute('aria-valuenow', '170')
        expect(screen.getByLabelText('Current font size value')).toHaveTextContent('170%')

        const backdrop = document.querySelector<HTMLElement>('.MuiBackdrop-root')
        if (!backdrop) throw new Error('Formatting popover backdrop is missing')
        await user.click(backdrop)
        expect(screen.queryByRole('dialog', { name: 'Current font size' })).not.toBeInTheDocument()
    })
})
