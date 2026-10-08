/** Integration retries reuse the existing system record for the same commit references. */
function appendSystemActivityRecord(activity, record) {
    const duplicate = record.commits?.length > 0 && activity.records.some((candidate) => (
        candidate.type === 'system'
        && candidate.label === record.label
        && candidate.commits?.length === record.commits.length
        && candidate.commits.every((commit, index) => (
            commit.commit === record.commits[index].commit && commit.branch === record.commits[index].branch
        ))
    ));
    if (duplicate) return activity;

    return { ...activity, records: [...activity.records, record] };
}

module.exports = { appendSystemActivityRecord };
