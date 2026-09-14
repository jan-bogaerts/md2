import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UseGithubAuthResult } from '../auth/use_github_auth'
import { cardPopupService } from '../services/card_popup_service'
import { AppThemeProvider } from '../theme/theme_provider'
import * as projectWorkspaceModule from './project_workspace'

const componentMocks = vi.hoisted(() => ({
    cardActionPopupHost: vi.fn(() => null),
    cardView: vi.fn(() => null),
    diagramView: vi.fn(() => null),
    fileTreeView: vi.fn(() => null),
    mobileCardView: vi.fn(() => null),
    mobileCardViewMenu: vi.fn(() => null),
    statsView: vi.fn(() => null),
    textView: vi.fn(() => null),
}))

vi.mock('./card_view/card_view', () => ({ CardView: componentMocks.cardView }))
vi.mock('./card_view/mobile_card_view', () => ({ MobileCardView: componentMocks.mobileCardView }))
vi.mock('./card_view/mobile_card_view_menu', () => ({ MobileCardViewMenu: componentMocks.mobileCardViewMenu }))
vi.mock('./actions/run/popup/card_action_popup_host', () => ({ CardActionPopupHost: componentMocks.cardActionPopupHost }))
vi.mock('./text_view/file_tree_view', () => ({ FileTreeView: componentMocks.fileTreeView }))
vi.mock('./text_view/text_view', () => ({ TextView: componentMocks.textView }))
vi.mock('./stats_view/stats_view', () => ({ StatsView: componentMocks.statsView }))
vi.mock('./diagram_view/diagram_view', () => ({ DiagramView: componentMocks.diagramView }))
vi.mock('./editor/attachment_choice_dialog', () => ({ AttachmentChoiceDialog: () => null }))
vi.mock('./hooks/use_project_reference', () => ({useProjectReference: () => ({ branch: 'main', id: 'project-1', rootPath: 'C:\\project' })}))
vi.mock('./hooks/use_project_config', () => ({ useProjectConfig: () => null }))
vi.mock('./hooks/use_working_folder', () => ({ useWorkingFolder: () => 'design' }))
vi.mock('./project_workspace_availability', () => ({ProjectWorkspaceAvailability: ({ children }: { children: ReactNode }) => children}))
vi.mock('./shell/split_layout', () => ({SplitLayout: ({ left, right }: { left: ReactNode, right: ReactNode }) => <>{left}{right}</>}))

const auth = {} as UseGithubAuthResult

function setScreenWidth(isMobile: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches: isMobile,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
}

function renderWorkspace() {
    return render(
        <AppThemeProvider>
            <projectWorkspaceModule.ProjectWorkspace auth={auth} isMenuOpen={false} onLeftPanelInteraction={vi.fn()} />
        </AppThemeProvider>,
    )
}

afterEach(() => {
    cleanup()
    cardPopupService.setMobileBackDismissEnabled(false)
    cardPopupService.clear()
    delete window.md2Lifecycle
    vi.restoreAllMocks()
    Object.values(componentMocks).forEach((componentMock) => componentMock.mockClear())
})

describe('ProjectWorkspace popup rendering', () => {
    it('does not rerender workspace regions when a card popup opens or closes', () => {
        setScreenWidth(false)
        const projectWorkspaceRender = vi.spyOn(projectWorkspaceModule, 'ProjectWorkspace')
        renderWorkspace()
        const initialRenderCounts = {
            cardView: componentMocks.cardView.mock.calls.length,
            diagramView: componentMocks.diagramView.mock.calls.length,
            fileTreeView: componentMocks.fileTreeView.mock.calls.length,
            projectWorkspace: projectWorkspaceRender.mock.calls.length,
            statsView: componentMocks.statsView.mock.calls.length,
            textView: componentMocks.textView.mock.calls.length,
        }
        const anchorElement = document.createElement('button')
        document.body.append(anchorElement)

        act(() => cardPopupService.toggleCardDetails('card-1', anchorElement))
        const popupEntry = cardPopupService.getSnapshot()[0]
        act(() => cardPopupService.close(popupEntry.id))

        expect(projectWorkspaceRender).toHaveBeenCalledTimes(initialRenderCounts.projectWorkspace)
        expect(componentMocks.cardView).toHaveBeenCalledTimes(initialRenderCounts.cardView)
        expect(componentMocks.fileTreeView).toHaveBeenCalledTimes(initialRenderCounts.fileTreeView)
        expect(componentMocks.textView).toHaveBeenCalledTimes(initialRenderCounts.textView)
        expect(componentMocks.statsView).toHaveBeenCalledTimes(initialRenderCounts.statsView)
        expect(componentMocks.diagramView).toHaveBeenCalledTimes(initialRenderCounts.diagramView)
    })

    it('enables back dismissal only for a small-screen browser and disables it on cleanup', () => {
        setScreenWidth(true)
        const setEnabled = vi.spyOn(cardPopupService, 'setMobileBackDismissEnabled')

        const workspace = renderWorkspace()

        expect(setEnabled).toHaveBeenCalledWith(true)
        workspace.unmount()
        expect(setEnabled.mock.calls.at(-1)?.[0]).toBe(false)
    })

    it.each([
        { isElectronApp: false, isMobile: false, name: 'wide-screen browser' },
        { isElectronApp: true, isMobile: true, name: 'small-screen Electron app' },
    ])('does not enable back dismissal in $name', ({ isElectronApp, isMobile }) => {
        setScreenWidth(isMobile)
        if (isElectronApp) {
            window.md2Lifecycle = {
                onFlushRequested: () => () => {},
                reportFlushResult: () => {},
            }
        }
        const setEnabled = vi.spyOn(cardPopupService, 'setMobileBackDismissEnabled')

        renderWorkspace()

        expect(setEnabled).not.toHaveBeenCalledWith(true)
        expect(setEnabled).toHaveBeenCalledWith(false)
    })
})
