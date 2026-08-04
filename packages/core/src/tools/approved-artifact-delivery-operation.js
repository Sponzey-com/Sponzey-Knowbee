import { createHash } from "node:crypto";
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js";
import { buildSideEffectOperationIdentity } from "../contracts/side-effect-operation.js";
const ARTIFACT_REF_PATTERN = /^artifact:[0-9a-f-]{36}$/iu;
function fingerprint(value) {
    const canonical = JSON.stringify(value, Object.keys(value).sort());
    return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}
export function resolveApprovedArtifactDeliveryOperation(input) {
    const capability = input.tool.channelCapability;
    if (capability?.kind !== "direct_artifact_delivery") {
        return { status: "not_required" };
    }
    if (input.ctx.source !== capability.channel
        || capability.channel !== "telegram") {
        return {
            status: "rejected",
            reasonCode: "approved_artifact_delivery_channel_mismatch",
        };
    }
    const artifactRef = typeof input.params.artifactRef === "string"
        ? input.params.artifactRef.trim()
        : "";
    if (!ARTIFACT_REF_PATTERN.test(artifactRef)) {
        return {
            status: "rejected",
            reasonCode: "approved_artifact_delivery_ref_required",
        };
    }
    const targetFingerprint = fingerprint({
        schemaVersion: 1,
        channel: capability.channel,
        sessionId: input.ctx.sessionId,
    });
    const paramsFingerprint = fingerprint({
        schemaVersion: 1,
        artifactRef,
    });
    const identity = buildSideEffectOperationIdentity({
        runId: input.ctx.runId,
        workId: canonicalWorkIdForRootRun(input.ctx.runId),
        stepKey: "delivering",
        adapterId: `channel:${capability.channel}:artifact`,
        targetFingerprint,
        paramsFingerprint,
    });
    const operationBindingHash = fingerprint({
        schemaVersion: 1,
        operationId: identity.operationId,
        targetFingerprint,
        paramsFingerprint,
        requestGroupId: input.ctx.requestGroupId ?? input.ctx.runId,
    });
    const binding = Object.freeze({
        operationId: identity.operationId,
        operationBindingHash,
        continuationSchemaVersion: 1,
    });
    return {
        status: "resolved",
        operation: Object.freeze({
            binding,
            artifactRef,
            targetFingerprint,
            authorizationParams: Object.freeze({
                operationId: binding.operationId,
                operationBindingHash: binding.operationBindingHash,
                artifactRef,
                targetFingerprint,
            }),
        }),
    };
}
//# sourceMappingURL=approved-artifact-delivery-operation.js.map