import { createHash } from "node:crypto";
export function buildChannelArtifactDeliveryExecutionTargetRef(source, destinationId) {
    const destinationFingerprint = createHash("sha256")
        .update(`${source.trim()}\u0000${destinationId.trim()}`, "utf8")
        .digest("hex");
    return `destination:${source.trim()}:sha256:${destinationFingerprint}`;
}
/**
 * Verify the opaque destination binding without recovering the channel's raw
 * destination ID.  Execution code uses this only after capability admission;
 * it does not infer delivery intent from user text or a Tool name.
 */
export function isChannelArtifactDeliveryExecutionTargetRef(source, targetRef) {
    const normalizedSource = source.trim();
    const prefix = `destination:${normalizedSource}:sha256:`;
    const fingerprint = targetRef.trim().slice(prefix.length);
    return Boolean(normalizedSource)
        && targetRef.trim().startsWith(prefix)
        && /^[a-f0-9]{64}$/u.test(fingerprint);
}
export function resolveChannelArtifactDeliveryRequirement(input) {
    if (!input.required)
        return { ok: true };
    const source = input.source.trim();
    const destinationId = input.destinationId.trim();
    const ownerAgentId = input.ownerAgentId.trim();
    if (!source || !destinationId || !ownerAgentId) {
        return { ok: false, reasonCode: "channel_delivery_destination_missing" };
    }
    const candidates = input.tools.filter((tool) => tool.name.trim() &&
        tool.channelCapability?.kind === "direct_artifact_delivery" &&
        tool.channelCapability.channel === source &&
        (tool.availableSources === undefined ||
            tool.availableSources.includes(source)));
    if (candidates.length === 0) {
        return { ok: false, reasonCode: "channel_delivery_capability_missing" };
    }
    if (candidates.length !== 1) {
        return { ok: false, reasonCode: "channel_delivery_capability_ambiguous" };
    }
    const capabilityId = candidates[0].name.trim();
    return {
        ok: true,
        requirement: {
            capabilityRef: `capability:${capabilityId}`,
            bindingTargetId: ownerAgentId,
            executionTargetId: buildChannelArtifactDeliveryExecutionTargetRef(source, destinationId),
        },
    };
}
//# sourceMappingURL=channel-artifact-delivery-requirement.js.map