import { createHash } from "node:crypto";
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js";
export function buildCanonicalSimplePathReleaseDescriptor(input) {
    const runId = input.runId.trim();
    if (!runId)
        throw new Error("Run ID is required for simple path release.");
    const requestText = input.requestText.trim();
    const answerText = input.answerText.trim();
    if (!requestText)
        throw new Error("Request text is required for simple path release.");
    if (!answerText)
        throw new Error("LLM answer text is required for simple path release.");
    return {
        runId,
        workId: canonicalWorkIdForRootRun(runId),
        classificationFingerprint: fingerprint(JSON.stringify(input.classification)),
        answerSource: input.answerSource,
        requestFingerprint: fingerprint(requestText),
        answerFingerprint: fingerprint(answerText),
    };
}
function fingerprint(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
export function releaseCanonicalSimplePath(descriptor, dependencies) {
    const aggregate = dependencies.loadAggregate(descriptor.workId);
    if (!aggregate)
        return { ok: false, reasonCode: "canonical_simple_path_aggregate_not_found" };
    if (aggregate.rootRunId !== descriptor.runId ||
        aggregate.state !== "REQUEST_RECEIVED" ||
        aggregate.revision !== 0) {
        return { ok: false, reasonCode: "canonical_simple_path_already_started" };
    }
    return dependencies.deleteUnstartedAggregate(descriptor.workId)
        ? { ok: true }
        : { ok: false, reasonCode: "canonical_simple_path_release_conflict" };
}
//# sourceMappingURL=canonical-simple-path.js.map