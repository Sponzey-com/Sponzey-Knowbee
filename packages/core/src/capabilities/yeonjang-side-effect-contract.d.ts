import type { AgentTool } from "../tools/types.js";
import { type YeonjangCapabilityRiskLevel, type YeonjangCapabilitySideEffectClass } from "./yeonjang-capability-schema.js";
export type YeonjangSideEffectPostCheckMode = "artifact_verified" | "llm_goal_validation_required" | "state_verified" | "target_observation_required";
export interface YeonjangSideEffectMethodContract {
    readonly method: string;
    readonly toolNames: readonly string[];
    readonly riskLevel: Exclude<YeonjangCapabilityRiskLevel, "safe">;
    readonly sideEffectClass: Exclude<YeonjangCapabilitySideEffectClass, "none" | "read_local" | "network">;
    readonly permissionSetting: string;
    readonly approvalRequired: true;
    readonly idempotencyRequired: true;
    readonly preEffectAuthorizationRequired: true;
    readonly postCheckRequired: true;
    readonly postCheckMode: YeonjangSideEffectPostCheckMode;
    readonly defaultLiveSmokeAllowed: false;
    readonly rawPayloadVisibility: "audit_only";
}
export declare const YEONJANG_SIDE_EFFECT_METHOD_CONTRACTS: readonly YeonjangSideEffectMethodContract[];
export declare function getYeonjangSideEffectMethodContract(method: string): YeonjangSideEffectMethodContract | undefined;
export declare function isYeonjangSideEffectMethod(method: string): boolean;
export type YeonjangSideEffectToolContractValidation = {
    ok: true;
    contract: YeonjangSideEffectMethodContract;
} | {
    ok: false;
    reasonCode: "method_not_side_effect" | "tool_missing_runtime_method" | "tool_name_not_bound" | "tool_requires_approval_missing" | "tool_risk_too_low";
};
export declare function validateYeonjangSideEffectToolContract(input: {
    method: string;
    tool: Pick<AgentTool, "name" | "requiresApproval" | "riskLevel" | "runtimeMethodIds">;
}): YeonjangSideEffectToolContractValidation;
//# sourceMappingURL=yeonjang-side-effect-contract.d.ts.map