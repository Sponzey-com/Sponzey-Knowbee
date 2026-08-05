/** Resolves one exact signed v2 projection without inventing a default target. */
export function resolveYeonjangMqttV2Target(input) {
    const requested = input.requestedExtensionId.trim();
    const matches = input.snapshots.filter((snapshot) => snapshot.protocolVersion === "2"
        && (snapshot.extensionId === requested || snapshot.nodeId === requested || snapshot.instanceId === requested));
    if (matches.length === 0)
        return { ok: false, reasonCode: "yeonjang_v2_target_not_found" };
    if (matches.length !== 1)
        return { ok: false, reasonCode: "yeonjang_v2_target_ambiguous" };
    const target = matches[0];
    if (target.state !== "online")
        return { ok: false, reasonCode: "yeonjang_v2_target_offline" };
    if (input.expectedSessionId && target.sessionId !== input.expectedSessionId) {
        return { ok: false, reasonCode: "yeonjang_v2_target_session_mismatch" };
    }
    if (!target.instanceId || !target.sessionId || !/^sha256:[0-9a-f]{64}$/u.test(target.targetFingerprint ?? "")) {
        return { ok: false, reasonCode: "yeonjang_v2_target_projection_incomplete" };
    }
    return {
        ok: true,
        target: {
            instanceId: target.instanceId,
            sessionId: target.sessionId,
            targetFingerprint: target.targetFingerprint,
        },
    };
}
//# sourceMappingURL=mqtt-v2-target.js.map