async page => {
    await page.evaluate(async () => {
        document.body.innerHTML = `
            <div id="harness" style="height: 100vh; overflow: hidden; position: relative; width: 100vw;">
                <div id="scroll" style="inset: 0; overflow-y: auto; position: absolute;">
                    <button id="card" style="height: 900px; margin: 40px; width: 280px;">Card</button>
                </div>
                <div id="mount"></div>
            </div>
        `

        const React = await import('/node_modules/.vite/deps/react.js')
        const ReactDom = await import('/node_modules/.vite/deps/react-dom_client.js')
        const { CardViewScrollZones } = await import('/src/components/card_view/card_view_scroll_zones.tsx')
        const reactApi = React.default ?? React
        const { createRoot } = ReactDom.default ?? ReactDom
        const scrollContainer = document.getElementById('scroll')
        const mount = document.getElementById('mount')

        createRoot(mount).render(reactApi.createElement(CardViewScrollZones, {
            scrollContainerRef: { current: scrollContainer },
        }))
        await new Promise(requestAnimationFrame)
        scrollContainer.scrollTop = 100
        window.cardActivations = 0
        document.getElementById('card').addEventListener('click', () => {
            window.cardActivations += 1
        })
    })

    const results = await page.evaluate(() => {
        const leftZone = document.querySelector('[data-testid="left-card-scroll-zone"]')
        const rightZone = document.querySelector('[data-testid="right-card-scroll-zone"]')
        const scrollContainer = document.getElementById('scroll')
        const drag = (zone, pointerId, startY, endY) => {
            zone.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: startY, pointerId }))
            zone.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: endY, pointerId }))
            zone.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: endY, pointerId }))
        }

        const leftWidth = leftZone.getBoundingClientRect().width
        const rightWidth = rightZone.getBoundingClientRect().width
        drag(leftZone, 1, 300, 250)
        const afterLeftDrag = scrollContainer.scrollTop
        drag(rightZone, 2, 250, 300)

        return {
            afterLeftDrag,
            afterRightDrag: scrollContainer.scrollTop,
            cardActivations: window.cardActivations,
            leftWidth,
            rightWidth,
            viewportWidth: window.innerWidth,
        }
    })

    if (results.viewportWidth !== 360) throw new Error(`Unexpected mobile viewport: ${results.viewportWidth}`)
    if (results.leftWidth !== 20 || results.rightWidth !== 20) throw new Error(`Unexpected zone widths: ${results.leftWidth}, ${results.rightWidth}`)
    if (results.afterLeftDrag !== 150 || results.afterRightDrag !== 100) throw new Error(`Unexpected scroll positions: ${results.afterLeftDrag}, ${results.afterRightDrag}`)
    if (results.cardActivations !== 0) throw new Error(`Card activated ${results.cardActivations} times`)

    return results
}
