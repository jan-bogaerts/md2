const agentProfiles = require('../shared/agent_profiles')

function resolveAgentCommand(config, selection = {}) {
    const agent = selection.agent ?? config.agent
    const profiles = config.agentProfiles ?? []
    const profile = agentProfiles.findAgentProfile(profiles, agent)
    if (!profile) throw new Error(`Unknown agent profile: ${agent}`)
    const model = (selection.model ?? config.model) || agentProfiles.defaultModelForProfile(profile)
    agentProfiles.validateAgentSelection(profiles, { agent, model }, 'desktop config')

    return { agent, command: agentProfiles.buildAgentCommand(profile, model), model, profile }
}

module.exports = {
    ...agentProfiles,
    resolveAgentCommand,
}
