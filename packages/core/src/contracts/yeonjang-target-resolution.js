import { projectYeonjangUserFacingIdentities, validateYeonjangIdentityBoundarySnapshot, } from "./yeonjang-identity-boundary.js";
function normalizeName(value) {
    return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
function stableHash(value) {
    let hash = 0xcbf29ce484222325n;
    for (const byte of new TextEncoder().encode(value)) {
        hash ^= BigInt(byte);
        hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, "0");
}
function fingerprintSnapshot(snapshot) {
    return stableHash(JSON.stringify(snapshot));
}
function fingerprintSelector(selector) {
    switch (selector.type) {
        case "instance_id": return stableHash(`instance_id:${selector.instanceId.trim()}`);
        case "instance_alias": return stableHash(`instance_alias:${normalizeName(selector.instanceAlias)}`);
        case "call_name": return stableHash(`call_name:${normalizeName(selector.callName)}`);
    }
}
export function resolveExactYeonjangTarget(input) {
    const snapshot = validateYeonjangIdentityBoundarySnapshot({ snapshot: input.snapshot, maxAgeMs: input.maxAgeMs });
    const selector = input.selector;
    const matches = snapshot.instances.filter((instance) => {
        if (selector.type === "instance_id")
            return instance.instanceId === selector.instanceId.trim();
        if (selector.type === "instance_alias")
            return normalizeName(instance.instanceAlias) === normalizeName(selector.instanceAlias);
        const requested = normalizeName(selector.callName);
        return instance.callNames.some((name) => normalizeName(name) === requested);
    });
    if (matches.length === 0)
        return { status: "not_found", reasonCode: "target_not_found", candidates: [] };
    const projections = projectYeonjangUserFacingIdentities(snapshot);
    const candidateProjection = matches.map((match) => projections[snapshot.instances.indexOf(match)]);
    if (matches.length > 1)
        return { status: "ambiguous", reasonCode: "target_ambiguous", candidates: candidateProjection };
    const target = matches[0];
    if (target.trustState !== "trusted")
        return { status: "unavailable", reasonCode: "target_untrusted", candidates: candidateProjection };
    if (target.connectionState === "offline")
        return { status: "unavailable", reasonCode: "target_offline", candidates: candidateProjection };
    if (target.connectionState === "degraded")
        return { status: "unavailable", reasonCode: "target_degraded", candidates: candidateProjection };
    const snapshotFingerprint = fingerprintSnapshot(snapshot);
    const selectorFingerprint = fingerprintSelector(selector);
    return {
        status: "resolved",
        reasonCode: "exact_target_resolved",
        receipt: {
            schemaVersion: 1,
            receiptId: `yeonjang-target:${stableHash(`${snapshotFingerprint}:${selectorFingerprint}:${target.instanceId}`)}`,
            snapshotFingerprint,
            selectorFingerprint,
            targetInstanceId: target.instanceId,
        },
    };
}
export function authorizeExactYeonjangTarget(input) {
    if (!input.receipt)
        throw new Error("Exact Yeonjang target receipt is required.");
    const decision = resolveExactYeonjangTarget(input);
    if (decision.status !== "resolved")
        throw new Error(`Exact Yeonjang target is no longer dispatchable: ${decision.status}.`);
    if (decision.receipt.receiptId !== input.receipt.receiptId
        || decision.receipt.snapshotFingerprint !== input.receipt.snapshotFingerprint
        || decision.receipt.selectorFingerprint !== input.receipt.selectorFingerprint
        || decision.receipt.targetInstanceId !== input.receipt.targetInstanceId) {
        throw new Error("Exact Yeonjang target receipt does not match the current selector and snapshot.");
    }
    return input.receipt.targetInstanceId;
}
//# sourceMappingURL=yeonjang-target-resolution.js.map