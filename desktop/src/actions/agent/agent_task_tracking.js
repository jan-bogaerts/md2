const CODEX_TASK_TRACKING_INSTRUCTIONS = 'Use `update_plan` to create and maintain a task list for multi-step work and whenever the user explicitly requests tasks. Do not create a plan for a simple one-step request or answer-only question.';

function codexOneShotPrompt(prompt, agent, taskTrackingEnabled) {
    if (agent !== 'codex' || !taskTrackingEnabled) return prompt;

    return `${CODEX_TASK_TRACKING_INSTRUCTIONS}\n\n${prompt}`;
}

module.exports = { CODEX_TASK_TRACKING_INSTRUCTIONS, codexOneShotPrompt };
