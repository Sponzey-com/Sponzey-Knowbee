import { type TaskExecutionSemantics, type TaskIntentEnvelope, type TaskStructuredRequest } from "../agent/intake.js";
import type { ChannelSource } from "../channels/contracts.js";
import type { AdmittedCapabilityExecutionScope } from "./run-scoped-tool-admission.js";
import { type RecoveryBudgetUsage } from "./recovery-budget.js";
export interface ResolvedExecutionProfile {
    originalRequest: string;
    structuredRequest: TaskStructuredRequest;
    intentEnvelope: TaskIntentEnvelope;
    executionSemantics: TaskExecutionSemantics;
    requiresFilesystemMutation: boolean;
    requiresPrivilegedToolExecution: boolean;
    wantsDirectArtifactDelivery: boolean;
    approvalRequired: boolean;
    approvalTool: string;
    requiredToolNames: string[];
}
export interface ExecutionLoopRuntimeState {
    executionProfile: ResolvedExecutionProfile;
    originalUserRequest: string;
    priorAssistantMessages: string[];
    seenFollowupPrompts: Set<string>;
    seenCommandFailureRecoveryKeys: Set<string>;
    seenExecutionRecoveryKeys: Set<string>;
    seenDeliveryRecoveryKeys: Set<string>;
    seenAiRecoveryKeys: Set<string>;
    recoveryBudgetUsage: RecoveryBudgetUsage;
    requiresFilesystemMutation: boolean;
    requiresPrivilegedToolExecution: boolean;
    pendingToolParams: Map<string, unknown>;
    filesystemMutationPaths: Set<string>;
}
export declare function buildResolvedExecutionProfile(params: {
    message: string;
    originalRequest?: string;
    executionSemantics?: TaskExecutionSemantics;
    structuredRequest?: TaskStructuredRequest;
    intentEnvelope?: TaskIntentEnvelope;
}): ResolvedExecutionProfile;
export declare function normalizeDirectArtifactDeliverySemantics(params: {
    message: string;
    originalRequest?: string;
    executionSemantics?: TaskExecutionSemantics;
    structuredRequest?: TaskStructuredRequest;
    intentEnvelope?: TaskIntentEnvelope;
}): TaskExecutionSemantics;
/**
 * Reconcile the LLM intake contract with the later, durable capability
 * admission. A channel destination binding exists only after the LLM plan and
 * policy validation select a direct-delivery capability, so it is authoritative
 * evidence that the result must cross the current channel boundary. This
 * prevents an earlier `artifactDelivery: none` value from creating a second,
 * conflicting execution path after a capture has already succeeded.
 */
export declare function resolveCapabilityScopedArtifactDeliverySemantics(params: {
    source: ChannelSource;
    executionSemantics: TaskExecutionSemantics;
    admittedCapabilityExecutionScope?: Pick<AdmittedCapabilityExecutionScope, "selectedToolTargets">;
}): TaskExecutionSemantics;
export declare function createExecutionLoopRuntimeState(params: {
    message: string;
    originalRequest?: string;
    executionSemantics?: TaskExecutionSemantics;
    structuredRequest?: TaskStructuredRequest;
    intentEnvelope?: TaskIntentEnvelope;
}): ExecutionLoopRuntimeState;
//# sourceMappingURL=execution-profile.d.ts.map