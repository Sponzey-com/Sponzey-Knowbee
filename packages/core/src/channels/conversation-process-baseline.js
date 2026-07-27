const UNSAFE_EVIDENCE_TEXT = /(?:\/Users\/|\/private\/|\/tmp\/|[A-Za-z]:\\|Bearer\s+|raw[_ -]?request|provider[_ -]?payload|chat[_ -]?id|prompt|token|secret|authorization|cookie)/iu;
const SAFE_COMMAND = /^pnpm exec vitest run --cache=false(?: tests\/[A-Za-z0-9._/-]+\.test\.ts)+$/u;
const SAFE_TEST_PATH = /^tests\/[A-Za-z0-9._/-]+\.test\.ts$/u;
const SAFE_FAILURE_CODE = /^[a-z][a-z0-9_.:-]{1,159}$/u;
const BUILD_REVISION = /^[a-f0-9]{40}$/u;
function unsafe(value) {
    return UNSAFE_EVIDENCE_TEXT.test(value);
}
export function projectConversationProcessBaseline(input) {
    if (!SAFE_COMMAND.test(input.command) || unsafe(input.command)) {
        return { status: "rejected", reasonCode: "invalid_command" };
    }
    if (!BUILD_REVISION.test(input.buildRevision)) {
        return { status: "rejected", reasonCode: "invalid_build_revision" };
    }
    if (!Number.isFinite(Date.parse(input.capturedAt))) {
        return { status: "rejected", reasonCode: "invalid_capture_time" };
    }
    const files = [];
    for (const file of input.testFiles) {
        if (!SAFE_TEST_PATH.test(file.path)
            || !Number.isSafeInteger(file.testCount)
            || file.testCount < 0
            || (file.status === "failed" && (!file.firstFailure || !file.classification))
            || (file.firstFailure !== undefined && !SAFE_FAILURE_CODE.test(file.firstFailure))) {
            if (unsafe(file.path)
                || (file.firstFailure !== undefined && unsafe(file.firstFailure))) {
                return { status: "rejected", reasonCode: "unsafe_evidence_text" };
            }
            return { status: "rejected", reasonCode: "invalid_test_file" };
        }
        files.push({
            path: file.path,
            status: file.status,
            testCount: file.testCount,
            ...(file.firstFailure ? { firstFailure: file.firstFailure } : {}),
            ...(file.classification ? { classification: file.classification } : {}),
        });
    }
    return {
        status: "ready",
        evidence: {
            schemaVersion: 1,
            evidenceClass: "working_evidence_only",
            command: input.command,
            buildRevision: input.buildRevision,
            capturedAt: input.capturedAt,
            totals: {
                files: files.length,
                tests: files.reduce((sum, file) => sum + file.testCount, 0),
                passedFiles: files.filter((file) => file.status === "passed").length,
                failedFiles: files.filter((file) => file.status === "failed").length,
            },
            files,
        },
    };
}
//# sourceMappingURL=conversation-process-baseline.js.map