/**
 * Mouse control tools.
 * Requires Yeonjang for execution.
 */
import { DEFAULT_YEONJANG_EXTENSION_ID, canYeonjangHandleMethod, invokeYeonjangMethod, isYeonjangUnavailableError } from "../../../yeonjang/mqtt-client.js";
import { buildYeonjangTargetParameterProperties, buildYeonjangTargetResolutionDetails, buildYeonjangTargetSelectionFailure, recordYeonjangRemoteExecutionApproval, revalidateYeonjangTargetSelection, resolveYeonjangTargetSelection, } from "../yeonjang-target.js";
import { withYeonjangRequestMetadata } from "../yeonjang-request-metadata.js";
import { toolUserFacingErrorMessage } from "../error-redaction.js";
import { buildYeonjangRequiredFailure } from "../yeonjang-required-failure.js";
import { resolveLocalOrYeonjangEvidenceSourceKind } from "../../evidence-source.js";
import { createYeonjangControlSideEffect } from "../yeonjang-control-side-effect.js";
const MOVE_DELAY_MS = 500;
async function observeMousePosition(params, ctx, result) {
    const details = result.details && typeof result.details === "object" ? result.details : {};
    const extensionId = typeof details.extensionId === "string" ? details.extensionId : params.extensionId ?? DEFAULT_YEONJANG_EXTENSION_ID;
    try {
        const observed = await invokeYeonjangMethod("mouse.position", {}, withYeonjangRequestMetadata(ctx, { extensionId, timeoutMs: 15_000 }));
        return {
            available: typeof observed.x === "number" && typeof observed.y === "number",
            ...(typeof observed.x === "number" ? { x: observed.x } : {}),
            ...(typeof observed.y === "number" ? { y: observed.y } : {}),
        };
    }
    catch {
        return { available: false, reason: "mouse_position_unavailable" };
    }
}
const mouseMoveSideEffect = createYeonjangControlSideEffect({
    method: "mouse.move",
    expectedState: (params) => ({
        accepted: true,
        action: "move",
        x: params.x,
        y: params.y,
    }),
    observeVerifiedState: async (params, ctx, result) => {
        const observed = await observeMousePosition(params, ctx, result);
        return observed.x === params.x && observed.y === params.y;
    },
});
const mouseClickSideEffect = createYeonjangControlSideEffect({
    method: "mouse.click",
    expectedState: (params) => ({
        accepted: true,
        action: params.double ? "double_click" : "click",
        x: params.x,
        y: params.y,
        button: params.button ?? "left",
        double: params.double === true,
    }),
    observeState: async (params, ctx, result) => {
        const details = result.details && typeof result.details === "object" ? result.details : {};
        const postCursor = await observeMousePosition(params, ctx, result);
        return {
            verified: false,
            observedState: {
                accepted: result.success,
                action: params.double ? "double_click" : "click",
                reason: result.success ? "llm_goal_validation_required" : result.error ?? "mouse_click_failed",
                targetObservation: {
                    preCursor: details.preCursor ?? { available: false, reason: "pre_cursor_not_observed" },
                    postCursor,
                    requestedCoordinate: { x: params.x, y: params.y },
                },
            },
        };
    },
});
const mouseActionSideEffect = createYeonjangControlSideEffect({
    method: "mouse.action",
    expectedState: (params) => ({
        accepted: true,
        action: params.action,
        ...(typeof params.x === "number" ? { x: params.x } : {}),
        ...(typeof params.y === "number" ? { y: params.y } : {}),
        ...(params.button ? { button: params.button } : {}),
        ...(typeof params.deltaX === "number" ? { deltaX: params.deltaX } : {}),
        ...(typeof params.deltaY === "number" ? { deltaY: params.deltaY } : {}),
    }),
    observeState: async (params, ctx, result) => {
        const details = result.details && typeof result.details === "object" ? result.details : {};
        const postCursor = await observeMousePosition(params, ctx, result);
        return {
            verified: false,
            observedState: {
                accepted: result.success,
                action: params.action,
                reason: result.success ? "llm_goal_validation_required" : result.error ?? "mouse_action_failed",
                targetObservation: {
                    preCursor: details.preCursor ?? { available: false, reason: "pre_cursor_not_observed" },
                    postCursor,
                    ...(typeof params.x === "number" && typeof params.y === "number"
                        ? { requestedCoordinate: { x: params.x, y: params.y } }
                        : {}),
                    ...(typeof params.deltaX === "number" || typeof params.deltaY === "number"
                        ? {
                            requestedScroll: {
                                deltaX: params.deltaX ?? 0,
                                deltaY: params.deltaY ?? 0,
                            },
                        }
                        : {}),
                },
            },
        };
    },
});
export const mouseMoveTool = {
    name: "mouse_move",
    resolveEvidenceSourceKind: resolveLocalOrYeonjangEvidenceSourceKind,
    runtimeHealthMode: "additional",
    runtimeMethodIds: ["mouse.move"],
    description: "마우스 커서를 지정한 화면 좌표로 이동합니다.",
    parameters: {
        type: "object",
        properties: {
            x: { type: "number", description: "X 좌표 (픽셀)" },
            y: { type: "number", description: "Y 좌표 (픽셀)" },
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
        },
        required: ["x", "y"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: mouseMoveSideEffect,
    execute: async (params, ctx) => {
        const selection = resolveYeonjangTargetSelection({
            requestedExtensionId: params.extensionId,
            targetSelector: params.targetSelector,
            expectedTargetSessionId: params.targetSessionId,
            userMessage: ctx.userMessage,
            requiredSupportProfiles: ["desktop_interactive", "desktop_limited"],
        });
        if (!selection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(selection),
            };
        }
        const extensionId = selection.extensionId;
        const yeonjangOptions = withYeonjangRequestMetadata(ctx, extensionId ? {
            extensionId,
            ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
        } : {});
        await new Promise((r) => setTimeout(r, MOVE_DELAY_MS));
        try {
            if (await canYeonjangHandleMethod("mouse.move", yeonjangOptions)) {
                const reboundSelection = revalidateYeonjangTargetSelection({
                    selection,
                    requiredSupportProfiles: ["desktop_interactive", "desktop_limited"],
                });
                if (!reboundSelection.ok) {
                    return {
                        success: false,
                        ...buildYeonjangTargetSelectionFailure(reboundSelection),
                    };
                }
                recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "mouse.move", ctx });
                const remote = await invokeYeonjangMethod("mouse.move", { x: params.x, y: params.y }, { ...yeonjangOptions, timeoutMs: 15_000 });
                return {
                    success: remote.moved,
                    output: remote.message || `마우스를 (${params.x}, ${params.y})로 이동했습니다.`,
                    details: {
                        via: "yeonjang",
                        x: remote.x,
                        y: remote.y,
                        ...buildYeonjangTargetResolutionDetails(reboundSelection),
                    },
                    ...(remote.moved ? {} : { error: "remote_mouse_move_failed" }),
                };
            }
        }
        catch (error) {
            if (!isYeonjangUnavailableError(error)) {
                const message = toolUserFacingErrorMessage(error);
                return {
                    success: false,
                    output: `Yeonjang 마우스 이동 실패: ${message}`,
                    error: message,
                    details: {
                        via: "yeonjang",
                        ...buildYeonjangTargetResolutionDetails(selection),
                    },
                };
            }
        }
        const failure = buildYeonjangRequiredFailure({ method: "mouse.move" });
        return {
            ...failure,
            details: {
                ...(failure.details && typeof failure.details === "object" ? failure.details : {}),
                ...buildYeonjangTargetResolutionDetails(selection),
            },
        };
    },
};
export const mouseClickTool = {
    name: "mouse_click",
    resolveEvidenceSourceKind: resolveLocalOrYeonjangEvidenceSourceKind,
    runtimeHealthMode: "additional",
    runtimeMethodIds: ["mouse.click"],
    description: "지정한 좌표에서 마우스 클릭을 수행합니다.",
    parameters: {
        type: "object",
        properties: {
            x: { type: "number", description: "X 좌표 (픽셀)" },
            y: { type: "number", description: "Y 좌표 (픽셀)" },
            button: {
                type: "string",
                enum: ["left", "right", "middle"],
                description: "클릭할 마우스 버튼 (기본: left)",
            },
            double: { type: "boolean", description: "더블 클릭 여부 (기본: false)" },
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
        },
        required: ["x", "y"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: mouseClickSideEffect,
    execute: async (params, ctx) => {
        const selection = resolveYeonjangTargetSelection({
            requestedExtensionId: params.extensionId,
            targetSelector: params.targetSelector,
            expectedTargetSessionId: params.targetSessionId,
            userMessage: ctx.userMessage,
            requiredSupportProfiles: ["desktop_interactive", "desktop_limited"],
        });
        if (!selection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(selection),
            };
        }
        const extensionId = selection.extensionId;
        const yeonjangOptions = withYeonjangRequestMetadata(ctx, extensionId ? {
            extensionId,
            ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
        } : {});
        await new Promise((r) => setTimeout(r, MOVE_DELAY_MS));
        try {
            if (await canYeonjangHandleMethod("mouse.click", yeonjangOptions)) {
                const reboundSelection = revalidateYeonjangTargetSelection({
                    selection,
                    requiredSupportProfiles: ["desktop_interactive", "desktop_limited"],
                });
                if (!reboundSelection.ok) {
                    return {
                        success: false,
                        ...buildYeonjangTargetSelectionFailure(reboundSelection),
                    };
                }
                recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "mouse.click", ctx });
                const preCursor = await observeMousePosition(params, ctx, {
                    success: true,
                    output: "pre mouse position observation",
                    details: buildYeonjangTargetResolutionDetails(reboundSelection),
                });
                const remote = await invokeYeonjangMethod("mouse.click", {
                    x: params.x,
                    y: params.y,
                    ...(params.button ? { button: params.button } : {}),
                    ...(params.double ? { double: params.double } : {}),
                }, { ...yeonjangOptions, timeoutMs: 15_000 });
                return {
                    success: remote.clicked,
                    output: remote.message || `(${params.x}, ${params.y}) 클릭 완료`,
                    details: {
                        via: "yeonjang",
                        x: remote.x,
                        y: remote.y,
                        button: remote.button,
                        double: remote.double,
                        preCursor,
                        ...buildYeonjangTargetResolutionDetails(reboundSelection),
                    },
                    ...(remote.clicked ? {} : { error: "remote_mouse_click_failed" }),
                };
            }
        }
        catch (error) {
            if (!isYeonjangUnavailableError(error)) {
                const message = toolUserFacingErrorMessage(error);
                return {
                    success: false,
                    output: `Yeonjang 마우스 클릭 실패: ${message}`,
                    error: message,
                    details: {
                        via: "yeonjang",
                        ...buildYeonjangTargetResolutionDetails(selection),
                    },
                };
            }
        }
        const failure = buildYeonjangRequiredFailure({ method: "mouse.click" });
        return {
            ...failure,
            details: {
                ...(failure.details && typeof failure.details === "object" ? failure.details : {}),
                ...buildYeonjangTargetResolutionDetails(selection),
            },
        };
    },
};
export const mouseActionTool = {
    name: "mouse_action",
    resolveEvidenceSourceKind: resolveLocalOrYeonjangEvidenceSourceKind,
    runtimeHealthMode: "additional",
    runtimeMethodIds: ["mouse.action"],
    description: "마우스 액션을 실행합니다. move, click, double_click, button_down, button_up, scroll을 지원합니다.",
    parameters: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: ["move", "click", "double_click", "button_down", "button_up", "scroll"],
                description: "실행할 마우스 액션",
            },
            x: { type: "number", description: "X 좌표 (선택)" },
            y: { type: "number", description: "Y 좌표 (선택)" },
            button: {
                type: "string",
                enum: ["left", "right", "middle"],
                description: "대상 버튼 (기본: left)",
            },
            deltaX: { type: "number", description: "가로 스크롤 값" },
            deltaY: { type: "number", description: "세로 스크롤 값" },
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
        },
        required: ["action"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: mouseActionSideEffect,
    execute: async (params, ctx) => {
        const selection = resolveYeonjangTargetSelection({
            requestedExtensionId: params.extensionId,
            targetSelector: params.targetSelector,
            expectedTargetSessionId: params.targetSessionId,
            userMessage: ctx.userMessage,
            requiredSupportProfiles: ["desktop_interactive", "desktop_limited"],
        });
        if (!selection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(selection),
            };
        }
        const extensionId = selection.extensionId;
        const yeonjangOptions = withYeonjangRequestMetadata(ctx, extensionId ? {
            extensionId,
            ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
        } : {});
        await new Promise((r) => setTimeout(r, MOVE_DELAY_MS));
        try {
            if (await canYeonjangHandleMethod("mouse.action", yeonjangOptions)) {
                const reboundSelection = revalidateYeonjangTargetSelection({
                    selection,
                    requiredSupportProfiles: ["desktop_interactive", "desktop_limited"],
                });
                if (!reboundSelection.ok) {
                    return {
                        success: false,
                        ...buildYeonjangTargetSelectionFailure(reboundSelection),
                    };
                }
                recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "mouse.action", ctx });
                const preCursor = await observeMousePosition(params, ctx, {
                    success: true,
                    output: "pre mouse position observation",
                    details: buildYeonjangTargetResolutionDetails(reboundSelection),
                });
                const remote = await invokeYeonjangMethod("mouse.action", {
                    action: params.action,
                    ...(typeof params.x === "number" ? { x: params.x } : {}),
                    ...(typeof params.y === "number" ? { y: params.y } : {}),
                    ...(params.button ? { button: params.button } : {}),
                    ...(typeof params.deltaX === "number" ? { delta_x: params.deltaX } : {}),
                    ...(typeof params.deltaY === "number" ? { delta_y: params.deltaY } : {}),
                }, { ...yeonjangOptions, timeoutMs: 15_000 });
                return {
                    success: remote.accepted,
                    output: remote.message || `마우스 액션 실행: ${params.action}`,
                    details: {
                        via: "yeonjang",
                        action: remote.action,
                        x: remote.x,
                        y: remote.y,
                        button: remote.button,
                        deltaX: remote.delta_x,
                        deltaY: remote.delta_y,
                        preCursor,
                        ...buildYeonjangTargetResolutionDetails(reboundSelection),
                    },
                    ...(remote.accepted ? {} : { error: "remote_mouse_action_failed" }),
                };
            }
        }
        catch (error) {
            if (!isYeonjangUnavailableError(error)) {
                const message = toolUserFacingErrorMessage(error);
                return {
                    success: false,
                    output: `Yeonjang 마우스 액션 실패: ${message}`,
                    error: message,
                    details: {
                        via: "yeonjang",
                        ...buildYeonjangTargetResolutionDetails(selection),
                    },
                };
            }
        }
        const failure = buildYeonjangRequiredFailure({ method: "mouse.action" });
        return {
            ...failure,
            details: {
                ...(failure.details && typeof failure.details === "object" ? failure.details : {}),
                ...buildYeonjangTargetResolutionDetails(selection),
            },
        };
    },
};
//# sourceMappingURL=mouse.js.map