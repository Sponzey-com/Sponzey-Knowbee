import { evaluateYeonjangBrowserFocusPostCheck } from "../../capabilities/yeonjang-browser-focus-contract.js";
export function createYeonjangBrowserFocusSideEffect(input) {
    return {
        effectClass: "external_write",
        compensationSupport: "irreversible",
        targetRef: input.targetRef,
        expectedState: input.expectedState,
        observe: async (params, ctx, result) => {
            const expectedState = input.expectedState(params, ctx);
            const observation = buildBrowserFocusObservedState(result, input.target(params, ctx), expectedState);
            return {
                available: observation.verified,
                targetRef: input.targetRef(params, ctx),
                expectedState,
                observedState: observation.observedState,
            };
        },
    };
}
function buildBrowserFocusObservedState(result, target, expectedState) {
    const details = result.details;
    const observedFocusedTarget = isFocusTargetProjection(details?.observedFocusedTarget)
        ? details.observedFocusedTarget
        : undefined;
    const evaluated = evaluateYeonjangBrowserFocusPostCheck({
        commandAccepted: result.success === true && details?.commandAccepted === true,
        expectedTarget: target,
        ...(observedFocusedTarget ? { observedFocusedTarget } : {}),
    });
    if (evaluated.state === "VERIFIED") {
        return {
            verified: true,
            observedState: expectedState,
        };
    }
    return {
        verified: false,
        observedState: {
            method: "browser.focus",
            commandAccepted: details?.commandAccepted === true,
            target,
            ...(observedFocusedTarget ? { observedFocusedTarget } : {}),
            postCheck: {
                state: evaluated.state,
                reasonCode: evaluated.reasonCode,
            },
        },
    };
}
function isFocusTargetProjection(value) {
    if (!value || typeof value !== "object")
        return false;
    const candidate = value;
    return (candidate.schemaVersion === "yeonjang-browser-focus-target-v1" &&
        candidate.targetKind === "browser_window_or_tab" &&
        typeof candidate.displayName === "string" &&
        Array.isArray(candidate.publicEvidenceFields) &&
        Array.isArray(candidate.auditOnlyFields));
}
//# sourceMappingURL=yeonjang-browser-focus-side-effect.js.map