const { spawn } = require('node:child_process');
const electron = require('electron');

const DEVELOPMENT_APP_URL = 'http://localhost:5173';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (!env.MD2_APP_URL) env.MD2_APP_URL = DEVELOPMENT_APP_URL;

const child = spawn(electron, ['.'], {
    env,
    stdio: 'inherit',
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }

    process.exit(code ?? 0);
});
