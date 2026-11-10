import { afterEach, describe, expect, it, vi } from 'vitest'

const routeJsonLink = vi.hoisted(() => vi.fn())
vi.mock('../../../services/json/json_link_navigation', () => ({ routeJsonLink }))

import { openMarkdownLink } from './markdown_link_dialog_navigation'

describe('openMarkdownLink', () => {
    afterEach(() => {
        routeJsonLink.mockReset()
        vi.restoreAllMocks()
    })

    it.each(['data.json', 'file:///C:/shared/data.json'])(
        'routes JSON only when Open is invoked for %s', (url) => {
            const anchor = document.createElement('a')
            const open = vi.spyOn(window, 'open').mockImplementation(() => null)
            routeJsonLink.mockReturnValue(true)

            openMarkdownLink(url, 'design/card.md', anchor)

            expect(routeJsonLink).toHaveBeenCalledWith('design/card.md', url, anchor)
            expect(open).not.toHaveBeenCalled()
        },
    )

    it.each(['http://docs.example/path', 'https://docs.example/path', 'mailto:user@example.com?subject=Hi&body=Text'])(
        'opens %s in a new external-window request',
        (url) => {
            const open = vi.spyOn(window, 'open').mockImplementation(() => null)

            openMarkdownLink(url, 'design/card.md', document.createElement('a'))

            expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer')
        },
    )

    it.each(['file:///C:/project/data.json', 'about:blank', 'not a url'])(
        'does not open unsupported destination %s',
        (url) => {
            const open = vi.spyOn(window, 'open').mockImplementation(() => null)

            openMarkdownLink(url, 'design/card.md', document.createElement('a'))

            expect(open).not.toHaveBeenCalled()
        },
    )
})
