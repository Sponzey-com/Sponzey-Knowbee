import { classifyYeonjangCapabilityMethod, } from "./yeonjang-capability-schema.js";
const CONTRACTS = [
    {
        method: "file.write",
        toolNames: ["yeonjang_file_write"],
        permissionSetting: "allow_file_write",
        postCheckMode: "state_verified",
    },
    {
        method: "file.patch",
        toolNames: ["yeonjang_file_patch"],
        permissionSetting: "allow_file_write",
        postCheckMode: "state_verified",
    },
    {
        method: "file.delete",
        toolNames: ["yeonjang_file_delete"],
        permissionSetting: "allow_file_delete",
        postCheckMode: "state_verified",
    },
    {
        method: "browser.open_url",
        toolNames: ["yeonjang_browser_open_url"],
        permissionSetting: "allow_browser_control",
        postCheckMode: "llm_goal_validation_required",
    },
    {
        method: "browser.focus",
        toolNames: [],
        permissionSetting: "allow_browser_control",
        postCheckMode: "target_observation_required",
    },
    {
        method: "clipboard.write",
        toolNames: ["yeonjang_clipboard_write"],
        permissionSetting: "allow_clipboard_write",
        postCheckMode: "state_verified",
    },
    {
        method: "camera.capture",
        toolNames: ["yeonjang_camera_capture"],
        permissionSetting: "allow_camera_access",
        postCheckMode: "artifact_verified",
    },
    {
        method: "screen.capture",
        toolNames: ["screen_capture", "screen_find_text"],
        permissionSetting: "allow_screen_capture",
        postCheckMode: "artifact_verified",
    },
    {
        method: "mouse.move",
        toolNames: ["mouse_move"],
        permissionSetting: "allow_mouse_control",
        postCheckMode: "target_observation_required",
    },
    {
        method: "mouse.click",
        toolNames: ["mouse_click"],
        permissionSetting: "allow_mouse_control",
        postCheckMode: "target_observation_required",
    },
    {
        method: "mouse.action",
        toolNames: ["mouse_action"],
        permissionSetting: "allow_mouse_control",
        postCheckMode: "target_observation_required",
    },
    {
        method: "keyboard.type",
        toolNames: ["keyboard_type"],
        permissionSetting: "allow_keyboard_control",
        postCheckMode: "target_observation_required",
    },
    {
        method: "keyboard.action",
        toolNames: ["keyboard_shortcut", "keyboard_action"],
        permissionSetting: "allow_keyboard_control",
        postCheckMode: "target_observation_required",
    },
    {
        method: "application.launch",
        toolNames: ["app_launch"],
        permissionSetting: "allow_application_launch",
        postCheckMode: "target_observation_required",
    },
    {
        method: "system.exec",
        toolNames: ["shell_exec"],
        permissionSetting: "allow_shell_exec",
        postCheckMode: "llm_goal_validation_required",
    },
    {
        method: "system.control",
        toolNames: [],
        permissionSetting: "allow_system_control",
        postCheckMode: "llm_goal_validation_required",
    },
];
export const YEONJANG_SIDE_EFFECT_METHOD_CONTRACTS = Object.freeze(CONTRACTS.map((contract) => {
    const classification = classifyYeonjangCapabilityMethod(contract.method);
    if (classification.riskLevel === "safe") {
        throw new Error(`YEONJANG_SIDE_EFFECT_RISK_UNSAFE:${contract.method}`);
    }
    if (classification.sideEffectClass === "none" ||
        classification.sideEffectClass === "read_local" ||
        classification.sideEffectClass === "network") {
        throw new Error(`YEONJANG_SIDE_EFFECT_CLASS_UNSAFE:${contract.method}`);
    }
    return Object.freeze({
        ...contract,
        riskLevel: classification.riskLevel,
        sideEffectClass: classification.sideEffectClass,
        approvalRequired: true,
        idempotencyRequired: true,
        preEffectAuthorizationRequired: true,
        postCheckRequired: true,
        defaultLiveSmokeAllowed: false,
        rawPayloadVisibility: "audit_only",
    });
}));
const CONTRACT_BY_METHOD = new Map(YEONJANG_SIDE_EFFECT_METHOD_CONTRACTS.map((contract) => [contract.method, contract]));
export function getYeonjangSideEffectMethodContract(method) {
    return CONTRACT_BY_METHOD.get(method.trim().toLowerCase());
}
export function isYeonjangSideEffectMethod(method) {
    return getYeonjangSideEffectMethodContract(method) != null;
}
export function validateYeonjangSideEffectToolContract(input) {
    const method = input.method.trim().toLowerCase();
    const contract = getYeonjangSideEffectMethodContract(method);
    if (!contract)
        return { ok: false, reasonCode: "method_not_side_effect" };
    if (!input.tool.runtimeMethodIds?.includes(method)) {
        return { ok: false, reasonCode: "tool_missing_runtime_method" };
    }
    if (!contract.toolNames.includes(input.tool.name)) {
        return { ok: false, reasonCode: "tool_name_not_bound" };
    }
    if (input.tool.requiresApproval !== true) {
        return { ok: false, reasonCode: "tool_requires_approval_missing" };
    }
    if (input.tool.riskLevel === "safe") {
        return { ok: false, reasonCode: "tool_risk_too_low" };
    }
    return { ok: true, contract };
}
//# sourceMappingURL=yeonjang-side-effect-contract.js.map