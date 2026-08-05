import { createHash } from "node:crypto";
import { DEFAULT_YEONJANG_EXTENSION_ID } from "../../yeonjang/mqtt-client.js";
function stable(value) {
    if (Array.isArray(value))
        return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
export function hashSideEffectText(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}
export function hashSideEffectValue(value) {
    return createHash("sha256").update(stable(value), "utf8").digest("hex");
}
function yeonjangTargetRef(params) {
    const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID;
    const sessionId = params.targetSessionId?.trim();
    return sessionId ? `${extensionId}#${sessionId}` : extensionId;
}
export function createYeonjangControlSideEffect(input) {
    const targetRef = (params, _ctx) => `yeonjang:${yeonjangTargetRef(params)}:${input.method}`;
    const observe = async (params, ctx, result) => {
        const expectedState = input.expectedState(params, ctx);
        const stateObservation = input.observeState
            ? await input.observeState(params, ctx, result, expectedState)
            : undefined;
        const verified = result.success && (stateObservation
            ? stateObservation.verified
            : input.observeVerifiedState
                ? await input.observeVerifiedState(params, ctx, result, expectedState)
                : false);
        return {
            available: verified,
            targetRef: targetRef(params, ctx),
            expectedState,
            observedState: stateObservation
                ? stateObservation.observedState
                : verified
                    ? expectedState
                    : {
                        accepted: false,
                        reason: result.success
                            ? "target_observation_required"
                            : result.error ?? `${input.method}_not_verified`,
                    },
        };
    };
    return {
        effectClass: "external_write",
        compensationSupport: "irreversible",
        targetRef,
        expectedState: input.expectedState,
        observe,
    };
}
//# sourceMappingURL=yeonjang-control-side-effect.js.map