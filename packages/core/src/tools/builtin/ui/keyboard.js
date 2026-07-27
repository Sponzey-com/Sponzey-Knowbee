/**
 * Keyboard control tools.
 * Requires Yeonjang for execution.
 */
import { DEFAULT_YEONJANG_EXTENSION_ID, canYeonjangHandleMethod, invokeYeonjangMethod, isYeonjangUnavailableError } from "../../../yeonjang/mqtt-client.js";
import { buildYeonjangTargetParameterProperties, buildYeonjangTargetResolutionDetails, buildYeonjangTargetSelectionFailure, recordYeonjangRemoteExecutionApproval, revalidateYeonjangTargetSelection, resolveYeonjangTargetSelection, } from "../yeonjang-target.js";
import { withYeonjangRequestMetadata } from "../yeonjang-request-metadata.js";
import { toolUserFacingErrorMessage } from "../error-redaction.js";
import { buildYeonjangRequiredFailure } from "../yeonjang-required-failure.js";
import { resolveLocalOrYeonjangEvidenceSourceKind } from "../../evidence-source.js";
import { createYeonjangControlSideEffect, hashSideEffectText } from "../yeonjang-control-side-effect.js";
const TYPE_DELAY_MS = 500;
async function observeFocusedTarget(params, ctx, result) {
    const details = result.details && typeof result.details === "object" ? result.details : {};
    const extensionId = typeof details.extensionId === "string" ? details.extensionId : params.extensionId ?? DEFAULT_YEONJANG_EXTENSION_ID;
    try {
        const observed = await invokeYeonjangMethod("input.focused_target", {}, withYeonjangRequestMetadata(ctx, { extensionId, timeoutMs: 15_000 }));
        return observed.available === true;
    }
    catch {
        return false;
    }
}
const MODIFIER_KEY_ALIASES = new Map([
    ["leftcontrol", "control"],
    ["rightcontrol", "control"],
    ["control", "control"],
    ["ctrl", "control"],
    ["leftctrl", "control"],
    ["rightctrl", "control"],
    ["leftshift", "shift"],
    ["rightshift", "shift"],
    ["shift", "shift"],
    ["leftalt", "alt"],
    ["rightalt", "alt"],
    ["alt", "alt"],
    ["option", "alt"],
    ["leftoption", "alt"],
    ["rightoption", "alt"],
    ["leftsuper", "meta"],
    ["rightsuper", "meta"],
    ["super", "meta"],
    ["meta", "meta"],
    ["cmd", "meta"],
    ["command", "meta"],
    ["leftcommand", "meta"],
    ["rightcommand", "meta"],
    ["win", "meta"],
    ["windows", "meta"],
]);
function normalizeModifierKey(key) {
    return MODIFIER_KEY_ALIASES.get(key.trim().toLowerCase()) ?? null;
}
function splitShortcutKeys(keys) {
    const trimmed = keys.map((key) => key.trim()).filter(Boolean);
    if (trimmed.length === 0) {
        throw new Error("단축키에는 최소 한 개 이상의 키가 필요합니다.");
    }
    const nonModifierKeys = trimmed.filter((key) => normalizeModifierKey(key) === null);
    if (nonModifierKeys.length === 0) {
        throw new Error("단축키에는 modifier가 아닌 일반 키가 하나 필요합니다.");
    }
    if (nonModifierKeys.length > 1) {
        throw new Error(`여러 일반 키를 동시에 누르는 단축키는 지원하지 않습니다: ${nonModifierKeys.join(", ")}`);
    }
    const primaryKey = nonModifierKeys[0];
    const modifiers = Array.from(new Set(trimmed
        .filter((key) => key !== primaryKey)
        .map((key) => normalizeModifierKey(key))
        .filter((value) => typeof value === "string")));
    return { key: primaryKey, modifiers };
}
const keyboardTypeSideEffect = createYeonjangControlSideEffect({
    method: "keyboard.type",
    expectedState: (params) => ({
        accepted: true,
        action: "type_text",
        textLength: params.text.length,
        textHash: hashSideEffectText(params.text),
    }),
    observeVerifiedState: observeFocusedTarget,
});
const keyboardShortcutSideEffect = createYeonjangControlSideEffect({
    method: "keyboard.action",
    expectedState: (params) => {
        const shortcut = splitShortcutKeys(params.keys);
        return {
            accepted: true,
            action: "shortcut",
            key: shortcut.key,
            modifiers: shortcut.modifiers,
        };
    },
    observeVerifiedState: observeFocusedTarget,
});
const keyboardActionSideEffect = createYeonjangControlSideEffect({
    method: "keyboard.action",
    expectedState: (params) => ({
        accepted: true,
        action: params.action,
        ...(typeof params.key === "string" ? { key: params.key } : {}),
        ...(params.modifiers?.length ? { modifiers: params.modifiers } : {}),
        ...(typeof params.text === "string"
            ? {
                textLength: params.text.length,
                textHash: hashSideEffectText(params.text),
            }
            : {}),
    }),
    observeVerifiedState: observeFocusedTarget,
});
export const keyboardTypeTool = {
    name: "keyboard_type",
    resolveEvidenceSourceKind: resolveLocalOrYeonjangEvidenceSourceKind,
    runtimeHealthMode: "additional",
    runtimeMethodIds: ["keyboard.type"],
    description: "키보드로 텍스트를 입력합니다. 현재 포커스된 입력창에 텍스트가 입력됩니다.",
    parameters: {
        type: "object",
        properties: {
            text: { type: "string", description: "입력할 텍스트" },
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
        },
        required: ["text"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: keyboardTypeSideEffect,
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
        await new Promise((r) => setTimeout(r, TYPE_DELAY_MS));
        try {
            if (await canYeonjangHandleMethod("keyboard.type", yeonjangOptions)) {
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
                recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "keyboard.type", ctx });
                const remote = await invokeYeonjangMethod("keyboard.type", { text: params.text }, { ...yeonjangOptions, timeoutMs: 15_000 });
                return {
                    success: remote.typed,
                    output: remote.message || `텍스트 입력 완료: "${params.text.slice(0, 50)}${params.text.length > 50 ? "…" : ""}"`,
                    details: {
                        via: "yeonjang",
                        textLength: remote.text_len,
                        ...buildYeonjangTargetResolutionDetails(reboundSelection),
                    },
                    ...(remote.typed ? {} : { error: "remote_keyboard_type_failed" }),
                };
            }
        }
        catch (error) {
            if (!isYeonjangUnavailableError(error)) {
                const message = toolUserFacingErrorMessage(error);
                return {
                    success: false,
                    output: `Yeonjang 키보드 입력 실패: ${message}`,
                    error: message,
                    details: {
                        via: "yeonjang",
                        ...buildYeonjangTargetResolutionDetails(selection),
                    },
                };
            }
        }
        const failure = buildYeonjangRequiredFailure({ method: "keyboard.type" });
        return {
            ...failure,
            details: {
                ...(failure.details && typeof failure.details === "object" ? failure.details : {}),
                ...buildYeonjangTargetResolutionDetails(selection),
            },
        };
    },
};
export const keyboardShortcutTool = {
    name: "keyboard_shortcut",
    resolveEvidenceSourceKind: resolveLocalOrYeonjangEvidenceSourceKind,
    runtimeHealthMode: "additional",
    runtimeMethodIds: ["keyboard.action"],
    description: "키보드 단축키를 실행합니다. 예: Ctrl+C, Cmd+Space, Alt+F4 등.",
    parameters: {
        type: "object",
        properties: {
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
            keys: {
                type: "array",
                items: { type: "string" },
                description: "누를 키 목록 (예: [\"LeftControl\", \"c\"] for Ctrl+C). nut-js Key enum 기준.",
            },
        },
        required: ["keys"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: keyboardShortcutSideEffect,
    execute: async (params, ctx) => {
        const shortcut = splitShortcutKeys(params.keys);
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
        await new Promise((r) => setTimeout(r, TYPE_DELAY_MS));
        try {
            if (await canYeonjangHandleMethod("keyboard.action", yeonjangOptions)) {
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
                recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "keyboard.action", ctx });
                const remote = await invokeYeonjangMethod("keyboard.action", {
                    action: "shortcut",
                    key: shortcut.key,
                    modifiers: shortcut.modifiers,
                }, { ...yeonjangOptions, timeoutMs: 15_000 });
                return {
                    success: remote.accepted,
                    output: remote.message || `단축키 실행: ${params.keys.join("+")}`,
                    details: {
                        via: "yeonjang",
                        action: remote.action,
                        key: remote.key ?? shortcut.key,
                        modifiers: remote.modifiers ?? shortcut.modifiers,
                        ...buildYeonjangTargetResolutionDetails(reboundSelection),
                    },
                    ...(remote.accepted ? {} : { error: "remote_keyboard_shortcut_failed" }),
                };
            }
        }
        catch (error) {
            if (!isYeonjangUnavailableError(error)) {
                const message = toolUserFacingErrorMessage(error);
                return {
                    success: false,
                    output: `Yeonjang 단축키 실행 실패: ${message}`,
                    error: message,
                    details: {
                        via: "yeonjang",
                        ...buildYeonjangTargetResolutionDetails(selection),
                    },
                };
            }
        }
        const failure = buildYeonjangRequiredFailure({ method: "keyboard.action" });
        return {
            ...failure,
            details: {
                ...(failure.details && typeof failure.details === "object" ? failure.details : {}),
                ...buildYeonjangTargetResolutionDetails(selection),
            },
        };
    },
};
export const keyboardActionTool = {
    name: "keyboard_action",
    resolveEvidenceSourceKind: resolveLocalOrYeonjangEvidenceSourceKind,
    runtimeHealthMode: "additional",
    runtimeMethodIds: ["keyboard.action"],
    description: "키보드 액션을 실행합니다. type_text, shortcut, key_press, key_down, key_up을 지원합니다.",
    parameters: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: ["type_text", "shortcut", "key_press", "key_down", "key_up"],
                description: "실행할 키보드 액션",
            },
            text: { type: "string", description: "type_text에서 입력할 텍스트" },
            key: { type: "string", description: "shortcut 또는 key_* 액션의 대상 키" },
            modifiers: {
                type: "array",
                items: { type: "string" },
                description: "함께 누를 modifier 키 목록",
            },
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
        },
        required: ["action"],
    },
    riskLevel: "moderate",
    requiresApproval: true,
    sideEffect: keyboardActionSideEffect,
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
        await new Promise((r) => setTimeout(r, TYPE_DELAY_MS));
        try {
            if (await canYeonjangHandleMethod("keyboard.action", yeonjangOptions)) {
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
                recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "keyboard.action", ctx });
                const remote = await invokeYeonjangMethod("keyboard.action", {
                    action: params.action,
                    ...(typeof params.text === "string" ? { text: params.text } : {}),
                    ...(typeof params.key === "string" ? { key: params.key } : {}),
                    ...(params.modifiers?.length ? { modifiers: params.modifiers } : {}),
                }, { ...yeonjangOptions, timeoutMs: 15_000 });
                return {
                    success: remote.accepted,
                    output: remote.message || `키보드 액션 실행: ${params.action}`,
                    details: {
                        via: "yeonjang",
                        action: remote.action,
                        key: remote.key,
                        modifiers: remote.modifiers,
                        textLength: remote.text_len,
                        ...buildYeonjangTargetResolutionDetails(reboundSelection),
                    },
                    ...(remote.accepted ? {} : { error: "remote_keyboard_action_failed" }),
                };
            }
        }
        catch (error) {
            if (!isYeonjangUnavailableError(error)) {
                const message = toolUserFacingErrorMessage(error);
                return {
                    success: false,
                    output: `Yeonjang 키보드 액션 실패: ${message}`,
                    error: message,
                    details: {
                        via: "yeonjang",
                        ...buildYeonjangTargetResolutionDetails(selection),
                    },
                };
            }
        }
        const failure = buildYeonjangRequiredFailure({ method: "keyboard.action" });
        return {
            ...failure,
            details: {
                ...(failure.details && typeof failure.details === "object" ? failure.details : {}),
                ...buildYeonjangTargetResolutionDetails(selection),
            },
        };
    },
};
//# sourceMappingURL=keyboard.js.map