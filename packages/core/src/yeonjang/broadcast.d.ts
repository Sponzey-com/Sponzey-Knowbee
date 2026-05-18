import { buildArtifactAccessDescriptor } from "../artifacts/lifecycle.js";
import { type YeonjangBroadcastIntent, type YeonjangBroadcastToolName } from "../contracts/yeonjang-broadcast.js";
import type { YeonjangTargetSelector } from "../contracts/yeonjang-target.js";
import { type YeonjangFleetProjectionInput, type YeonjangProjectedInstance, type YeonjangSupportProfile } from "./topology.js";
import { type YeonjangBroadcastPolicy } from "./broadcast-policy.js";
export type YeonjangBroadcastTargetStatus = "planned" | "skipped" | "succeeded" | "failed";
export interface YeonjangBroadcastPlannedTarget {
    broadcastIndex: number;
    broadcastTotal: number;
    instanceId: string;
    extensionId: string;
    sessionId: string | null;
    instanceAlias: string;
    displayName: string;
    location: YeonjangProjectedInstance["location"];
    supportProfile: YeonjangSupportProfile;
    trustState: YeonjangProjectedInstance["trustState"];
    requiredMethods: string[];
}
export interface YeonjangBroadcastSkippedTarget {
    instanceId: string;
    extensionId: string;
    instanceAlias: string;
    displayName: string;
    reasonCodes: string[];
}
export interface YeonjangBroadcastPlanTrace {
    selector: YeonjangTargetSelector;
    broadcastIntent: YeonjangBroadcastIntent;
    requestedToolName: YeonjangBroadcastToolName;
    requiredMethods: string[];
    plannedTargetIds: string[];
    skippedTargetIds: string[];
    retryReceipt: {
        requested: boolean;
        retryMode: "failed_only";
        previousBroadcastRunId: string | null;
        previousTargetCount: number;
        previousSucceededCount: number;
        previousIncompleteCount: number;
        skippedSucceededTargetIds: string[];
        skippedUnknownTargetIds: string[];
        retriedTargetIds: string[];
    };
}
export interface YeonjangBroadcastRunPlan {
    broadcastRunId: string;
    toolName: YeonjangBroadcastToolName;
    transportMethod: string;
    policy: YeonjangBroadcastPolicy;
    selector: YeonjangTargetSelector;
    broadcastIntent: YeonjangBroadcastIntent;
    targets: YeonjangBroadcastPlannedTarget[];
    skippedTargets: YeonjangBroadcastSkippedTarget[];
    trace: YeonjangBroadcastPlanTrace;
}
export type YeonjangBroadcastPlanResult = {
    ok: true;
    plan: YeonjangBroadcastRunPlan;
} | {
    ok: false;
    code: "invalid_broadcast_selector" | "missing_broadcast_intent" | "invalid_broadcast_intent" | "invalid_retry_receipt" | "broadcast_target_selection_empty" | "broadcast_policy_denied";
    message: string;
    reasonCodes: string[];
    details?: Record<string, unknown>;
};
export interface YeonjangBroadcastTargetExecutionRecord {
    status: Exclude<YeonjangBroadcastTargetStatus, "planned">;
    broadcastIndex: number;
    instanceId: string;
    extensionId: string;
    sessionId: string | null;
    instanceAlias: string;
    displayName: string;
    reasonCodes: string[];
    output?: string;
    error?: string;
    artifactPath?: string | null;
    artifact?: ReturnType<typeof buildArtifactAccessDescriptor>;
}
export interface YeonjangBroadcastAggregateSummary {
    broadcastRunId: string;
    totalTargets: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    partialSuccess: boolean;
    reasonCodes: string[];
    retryRequested: boolean;
    retrySkippedSucceededCount: number;
    retrySkippedUnknownCount: number;
    retryTargetCount: number;
}
export declare function planYeonjangBroadcastRun(params: {
    toolName: YeonjangBroadcastToolName;
    targetSelector?: unknown;
    broadcastIntent?: unknown;
    retryReceipt?: unknown;
    policy?: YeonjangBroadcastPolicy;
    snapshots?: YeonjangFleetProjectionInput["snapshots"];
    instances?: YeonjangFleetProjectionInput["instances"];
    now?: number;
}): YeonjangBroadcastPlanResult;
export declare function buildYeonjangBroadcastArtifactPath(params: {
    broadcastRunId: string;
    instanceId: string;
    sessionId?: string | null;
    fileName: string;
    rootDir: string;
}): string;
export declare function buildYeonjangBroadcastAggregateSummary(params: {
    broadcastRunId: string;
    records: YeonjangBroadcastTargetExecutionRecord[];
    skippedTargets?: YeonjangBroadcastSkippedTarget[];
    retryTrace?: YeonjangBroadcastPlanTrace["retryReceipt"];
}): YeonjangBroadcastAggregateSummary;
//# sourceMappingURL=broadcast.d.ts.map