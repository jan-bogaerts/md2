const parcelWatcher = require('@parcel/watcher');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { parseDiagramData } = require('../../../../shared/diagram_data.mjs');

class ActionDiagramOutputWatcher {
    constructor(input, dependencies = {}) {
        this.diagramFile = path.resolve(input.diagramFile);
        this.handleError = input.handleError;
        this.handleReady = input.handleReady;
        this.projectRoot = path.resolve(input.projectRoot);
        this.readFile = dependencies.readFile ?? readFile;
        this.subscribe = dependencies.subscribe ?? parcelWatcher.subscribe;
        this.closed = false;
        this.ready = false;
        this.subscription = null;
        this.checkPromise = Promise.resolve();
    }

    async start() {
        const subscription = await this.subscribe(this.projectRoot, this.handleEvents);
        if (this.closed) {
            await subscription.unsubscribe();
            return;
        }
        this.subscription = subscription;
        await this.checkDiagram();
    }

    handleEvents = (error, events) => {
        if (this.closed || this.ready) return;
        if (error) {
            this.fail(error);
            return;
        }
        const changed = events.some((event) => ActionDiagramOutputWatcher.samePath(event.path, this.diagramFile));
        if (!changed) return;
        this.checkPromise = this.checkPromise.then(() => this.checkDiagram()).catch((checkError) => this.fail(checkError));
    };

    async checkDiagram() {
        if (this.closed || this.ready) return;
        let content;
        try {
            content = await this.readFile(this.diagramFile, 'utf8');
        } catch (error) {
            if (error?.code === 'ENOENT') return;
            throw error;
        }
        try {
            parseDiagramData(content);
        } catch {
            return;
        }
        if (this.closed || this.ready) return;
        this.ready = true;
        this.handleReady();
    }

    fail(error) {
        if (this.closed) return;
        this.handleError(error instanceof Error ? error : new Error('Diagram output watcher failed'));
    }

    async close() {
        if (this.closed) return;
        this.closed = true;
        await this.checkPromise;
        if (this.subscription) await this.subscription.unsubscribe();
        this.subscription = null;
    }

    static samePath(left, right) {
        const normalizedLeft = path.resolve(left);
        const normalizedRight = path.resolve(right);

        return process.platform === 'win32'
            ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
            : normalizedLeft === normalizedRight;
    }
}

module.exports = { ActionDiagramOutputWatcher };
