import type { YeonjangBroadcastToolName } from "../contracts/yeonjang-broadcast.js";
export type YeonjangBroadcastCommandClass = "observation" | "interaction" | "side_effect";
export type YeonjangBroadcastTargetRequirement = "trusted_only" | "approval_required";
export interface YeonjangBroadcastPolicy {
    toolName: YeonjangBroadcastToolName;
    transportMethod: string;
    commandClass: YeonjangBroadcastCommandClass;
    broadcastSafe: boolean;
    targetRequirement: YeonjangBroadcastTargetRequirement;
    approvalRequired: boolean;
    defaultDecision: "allow" | "deny";
    reasonCode: string;
    userMessage: string;
}
export declare function getYeonjangBroadcastPolicy(toolName: YeonjangBroadcastToolName): YeonjangBroadcastPolicy;
export declare function listYeonjangBroadcastPolicies(): YeonjangBroadcastPolicy[];
export declare function buildYeonjangBroadcastPolicyProjection(): {
    tools: YeonjangBroadcastPolicy[];
    summary: {
        totalTools: number;
        broadcastSafeTools: number;
        blockedTools: number;
        approvalRequiredTools: number;
    };
};
//# sourceMappingURL=broadcast-policy.d.ts.map