export interface CommandExecutionResult {
    command: string
    exitCode: number
    stderr: string
    stdout: string
}

export interface ElectronActionBridge {
    runCommand(command: string): Promise<CommandExecutionResult>
}

declare global {
    interface Window {
        md2Actions?: ElectronActionBridge
    }
}

export function getElectronActionBridge() {
    return window.md2Actions ?? null
}
