p = 'app/src/components/config/config_page.test.tsx'
s = open(p, encoding='utf-8').read()


def swap(old, new):
    global s
    assert old in s, old[:120]
    assert s.count(old) == 1, old[:120]
    s = s.replace(old, new)


# 1 - typed editors render on the project tab
swap("""    it('renders typed editors with descriptions', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('')

        expect(screen.getByRole('switch', { name: 'Startup splash' })).toBeInTheDocument()
        expect(screen.getByRole('slider', { name: 'Auto commit delay' })).toBeInTheDocument()
        expect(screen.getByText('Delay before editor changes are committed after typing stops.')).toBeInTheDocument()
        expect(screen.getByRole('region', { name: 'React app' })).not.toHaveClass('MuiPaper-root')
        expect(screen.queryByLabelText('GitHub scopes')).toBeNull()
    })""",
"""    it('renders typed editors with descriptions', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)

        renderConfigPage('')

        expect(screen.getByRole('switch', { name: 'Delete integrated card branch' })).toBeInTheDocument()
        expect(screen.getByRole('slider', { name: 'Auto commit delay' })).toBeInTheDocument()
        expect(screen.getByText('Delay before editor changes are committed after typing stops.')).toBeInTheDocument()
        expect(screen.getByRole('region', { name: 'Project' })).not.toHaveClass('MuiPaper-root')
        expect(screen.queryByLabelText('GitHub scopes')).toBeNull()
    })

    it('lists the config tabs without a React app tab and defaults to the project tab', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)

        renderConfigPage('#react')

        expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Project', 'Sentry', 'Markdown', 'Desktop'])
        expect(screen.queryByRole('tab', { name: 'React app' })).toBeNull()
        expect(screen.queryByRole('switch', { name: 'Startup splash' })).toBeNull()
        expect(screen.getByRole('tab', { name: 'Project' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('region', { name: 'Project' })).toBeInTheDocument()
    })

    it('holds diff command, push mode, branch cleanup and the auto commit delay in the git group', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)

        renderConfigPage('#project')
        const gitGroup = screen.getByRole('group', { name: 'Git' })

        expect(within(gitGroup).getByText(/branch cleanup/u)).toBeInTheDocument()
        expect([
            within(gitGroup).getByRole('textbox', { name: 'Diff command' }),
            within(gitGroup).getByRole('combobox', { name: 'Push mode' }),
            within(gitGroup).getByRole('switch', { name: 'Delete integrated card branch' }),
            within(gitGroup).getByRole('switch', { name: 'Delete released card branches' }),
            within(gitGroup).getByRole('slider', { name: 'Auto commit delay' }),
        ]).toEqual(within(gitGroup).getAllByRole(['textbox', 'combobox', 'switch', 'slider']))
    })""")

# 2 - hash routing
swap("""        renderConfigPage('#desktop')

        expect(screen.getByLabelText('Agent')).toBeInTheDocument()
        expect(screen.queryByRole('switch', { name: 'Startup splash' })).toBeNull()
        expect(screen.getByRole('tab', { name: 'React app' })).toHaveAttribute('href', '#/config/react')
    })""",
"""        renderConfigPage('#desktop')

        expect(screen.getByLabelText('Agent')).toBeInTheDocument()
        expect(screen.queryByRole('switch', { name: 'Delete integrated card branch' })).toBeNull()
        expect(screen.getByRole('tab', { name: 'Desktop' })).toHaveAttribute('href', '#/config/desktop')
    })""")

# 3 - StrictMode draft
swap("""        renderConfigPage('', true)

        expect(loadDraft).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('switch', { name: 'Startup splash' })).toBeInTheDocument()""",
"""        configService.loadProjectConfig(null)

        renderConfigPage('', true)

        expect(loadDraft).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('switch', { name: 'Delete integrated card branch' })).toBeInTheDocument()""")

# 4 - saves draft edits
swap("""    it('saves draft edits into active config', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(configService.get('react.showStartupSplash')).toBe(false)
    })""",
"""    it('saves draft edits into active config', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(configService, 'saveProjectConfig').mockResolvedValue()

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Delete integrated card branch' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(configService.get('project.deleteBranchAfterIntegration')).toBe(true)
        saveProjectConfig.mockRestore()
    })""")

# 5 - reports success
swap("""        configService.init()
        const reportSuccess = vi.spyOn(dialogService, 'success')

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))""",
"""        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(configService, 'saveProjectConfig').mockResolvedValue()
        const reportSuccess = vi.spyOn(dialogService, 'success')

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Delete integrated card branch' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))""")
swap("""        reportSuccess.mockRestore()
    })

    it('saves slider draft edits into active config', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('')
        fireEvent.change(screen.getByRole('slider', { name: 'Auto commit delay' }), { target: { value: '5000' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(configService.get('react.autoCommitDelayMs')).toBe(5000)
    })

    it('does not save project config when only React config changed', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(configService, 'saveProjectConfig').mockResolvedValue()

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(saveProjectConfig).not.toHaveBeenCalled()
        saveProjectConfig.mockRestore()
    })""",
"""        reportSuccess.mockRestore()
        saveProjectConfig.mockRestore()
    })

    it('saves slider draft edits into active config', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(configService, 'saveProjectConfig').mockResolvedValue()

        renderConfigPage('')
        fireEvent.change(screen.getByRole('slider', { name: 'Auto commit delay' }), { target: { value: '5000' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(configService.get('project.autoCommitDelayMs')).toBe(5000)
        saveProjectConfig.mockRestore()
    })

    it('does not save project config when only the markdown style changed', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(configService, 'saveProjectConfig').mockResolvedValue()

        renderConfigPage('#markdown')
        fireEvent.click(screen.getByRole('button', { name: 'Body' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Font size for Body' }), { target: { value: '1.2rem' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(saveProjectConfig).not.toHaveBeenCalled()
        saveProjectConfig.mockRestore()
    })""")

# 9 - cancel
swap("""    it('cancels draft edits without changing active config', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.change(screen.getByRole('slider', { name: 'Auto commit delay' }), { target: { value: '5000' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(configService.get('react.showStartupSplash')).toBe(true)
        expect(configService.get('react.autoCommitDelayMs')).toBe(30000)
        expect(window.location.hash).toBe('')
    })""",
"""    it('cancels draft edits without changing active config', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Delete integrated card branch' }))
        fireEvent.change(screen.getByRole('slider', { name: 'Auto commit delay' }), { target: { value: '5000' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(configService.get('project.deleteBranchAfterIntegration')).toBe(false)
        expect(configService.get('project.autoCommitDelayMs')).toBe(30000)
        expect(window.location.hash).toBe('')
    })""")

# 11 - escape
swap("""    it('discards edits and closes from Escape', async () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.keyDown(screen.getByRole('dialog', { name: 'Config' }), { key: 'Escape' })

        await waitFor(() => expect(window.location.hash).toBe(''))
        expect(configService.get('react.showStartupSplash')).toBe(true)
    })""",
"""    it('discards edits and closes from Escape', async () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Delete integrated card branch' }))
        fireEvent.keyDown(screen.getByRole('dialog', { name: 'Config' }), { key: 'Escape' })

        await waitFor(() => expect(window.location.hash).toBe(''))
        expect(configService.get('project.deleteBranchAfterIntegration')).toBe(false)
    })""")

# 12 - desktop bridge untouched in web mode
swap("""    it('never touches the desktop bridge in web mode', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(window.md2Config).toBeUndefined()
    })""",
"""    it('never touches the desktop bridge in web mode', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(configService, 'saveProjectConfig').mockResolvedValue()

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Delete integrated card branch' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(window.md2Config).toBeUndefined()
        saveProjectConfig.mockRestore()
    })""")

open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
