/** Answer values for the questions flagged secret, so later output mentioning them can be redacted. */
function secretAnswerValues(questions, answers) {
    const secretQuestionIds = new Set(questions.filter(({ isSecret }) => isSecret).map(({ id }) => id));

    return Object.entries(answers)
        .filter(([questionId]) => secretQuestionIds.has(questionId))
        .flatMap(([, answer]) => Array.isArray(answer) ? answer : [answer])
        .filter((answer) => typeof answer === 'string' && answer.length > 0);
}

function redactSecrets(content, secretValues) {
    if (typeof content !== 'string' || !secretValues || secretValues.size === 0) return content;

    return [...secretValues]
        .sort((first, second) => second.length - first.length)
        .reduce((redacted, secret) => redacted.split(secret).join('[secret]'), content);
}

function redactTextArray(values, secretValues) {
    return values.map((value) => redactSecrets(value, secretValues));
}

function redactConversationEvent(event, secretValues) {
    return {
        ...event,
        command: redactSecrets(event.command, secretValues),
        content: redactSecrets(event.content, secretValues),
        details: Array.isArray(event.details) ? redactTextArray(event.details, secretValues) : event.details,
        label: redactSecrets(event.label, secretValues),
        output: redactSecrets(event.output, secretValues),
        summary: Array.isArray(event.summary) ? redactTextArray(event.summary, secretValues) : event.summary,
        workingDirectory: redactSecrets(event.workingDirectory, secretValues),
    };
}

module.exports = { redactConversationEvent, redactSecrets, redactTextArray, secretAnswerValues };
