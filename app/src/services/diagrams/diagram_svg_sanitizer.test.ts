import { describe, expect, it } from 'vitest'
import { sanitizeDiagramSvg } from './diagram_svg_sanitizer'

describe('sanitizeDiagramSvg', () => {
    it('removes executable and externally loading content while preserving safe presentation', () => {
        const sanitized = sanitizeDiagramSvg(`
            <!DOCTYPE svg>
            <svg xmlns="http://www.w3.org/2000/svg" onclick="bad()">
                <style>@import url(https://bad.example/style.css);</style>
                <script>alert(1)</script>
                <foreignObject><div>bad</div></foreignObject>
                <animate attributeName="x" />
                <a href="https://bad.example"><text>link</text></a>
                <linearGradient id="grad" />
                <rect fill="url(#grad)" stroke="blue" style="fill:url(https://bad.example/image)" />
                <use href="https://bad.example/icon.svg#x" />
                <text data-diagram-id="orders" data-diagram-label="Orders">Orders</text>
            </svg>
        `)

        expect(sanitized).not.toMatch(/script|foreignObject|animate|<a|<style|@import|onclick|https:\/\//u)
        expect(sanitized).toContain('stroke="blue"')
        expect(sanitized).toContain('fill="url(#grad)"')
        expect(sanitized).not.toContain('style=')
    })

    it('marks drill-down items as accessible buttons', () => {
        const sanitized = sanitizeDiagramSvg('<svg xmlns="http://www.w3.org/2000/svg"><g data-diagram-id="orders" data-diagram-label="Orders"/></svg>')

        expect(sanitized).toContain('data-diagram-id="orders"')
        expect(sanitized).toContain('aria-label="Orders"')
        expect(sanitized).toContain('role="button"')
        expect(sanitized).toContain('tabindex="0"')
    })

    it('rejects malformed XML, entities, incomplete items, and duplicate interactive IDs', () => {
        expect(() => sanitizeDiagramSvg('<svg><g></svg>')).toThrow('Invalid SVG XML')
        expect(() => sanitizeDiagramSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg />')).toThrow('entity declarations')
        expect(() => sanitizeDiagramSvg('<svg><g data-diagram-id="one" /></svg>')).toThrow('require data-diagram-id and data-diagram-label')
        expect(() => sanitizeDiagramSvg('<svg><g data-diagram-id="one" data-diagram-label="One"/><g data-diagram-id="one" data-diagram-label="Two"/></svg>'))
            .toThrow('Duplicate interactive SVG ID: one')
    })
})
