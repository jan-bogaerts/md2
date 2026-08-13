const DEFAULT_WINDOW_HEIGHT = 900;
const DEFAULT_WINDOW_WIDTH = 1280;

/** Create a BrowserWindow whose geometry and maximized state persist between launches. */
function createManagedWindow({ BrowserWindow, browserWindowOptions, windowStateKeeper }) {
    const windowState = windowStateKeeper({
        defaultHeight: DEFAULT_WINDOW_HEIGHT,
        defaultWidth: DEFAULT_WINDOW_WIDTH,
        fullScreen: false,
        maximize: true,
    });
    const window = new BrowserWindow({
        ...browserWindowOptions,
        height: windowState.height,
        width: windowState.width,
        x: windowState.x,
        y: windowState.y,
    });
    windowState.manage(window);

    return window;
}

module.exports = {
    createManagedWindow,
    DEFAULT_WINDOW_HEIGHT,
    DEFAULT_WINDOW_WIDTH,
};
