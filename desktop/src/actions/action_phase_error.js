class ActionPhaseError extends Error {
    constructor(message, phase, rootPhase, cause) {
        super(message, { cause })
        this.phase = phase
        this.rootPhase = rootPhase
    }
}

module.exports = { ActionPhaseError }
