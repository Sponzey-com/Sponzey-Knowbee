import type { AgentPromptBundle, CapabilityPolicy, CommandRequest, ModelProfile } from "./sub-agent-orchestration.js";
import { type WorkHandoffPackage } from "./work-record.js";
export type DelegatedExecutionSnapshotReasonCode = "delegated_execution_snapshot_valid" | "handoff_invalid" | "handoff_command_mismatch" | "handoff_target_mismatch" | "prompt_bundle_agent_mismatch" | "delegated_execution_snapshot_runtime_mismatch" | "delegated_execution_snapshot_fingerprint_mismatch";
export interface DelegatedExecutionSnapshot {
    readonly schemaVersion: "delegated-execution-snapshot-v1";
    readonly commandRequestId: string;
    readonly subSessionId: string;
    readonly handoff: WorkHandoffPackage;
    readonly agent: {
        agentId: string;
        agentName: string;
    };
    readonly prompt: {
        bundleId: string;
        checksum?: string;
    };
    readonly modelProfile?: ModelProfile;
    readonly capabilityPolicy: CapabilityPolicy;
    readonly fingerprint: `sha256:${string}`;
}
export interface BuildDelegatedExecutionSnapshotInput {
    command: Pick<CommandRequest, "commandRequestId" | "subSessionId" | "targetAgentId" | "targetAgentNameSnapshot">;
    handoff: WorkHandoffPackage;
    agent: {
        agentId: string;
        agentName: string;
    };
    promptBundle: AgentPromptBundle;
}
export declare function buildDelegatedExecutionSnapshot(input: BuildDelegatedExecutionSnapshotInput): {
    ok: true;
    snapshot: DelegatedExecutionSnapshot;
} | {
    ok: false;
    reasonCode: Exclude<DelegatedExecutionSnapshotReasonCode, "delegated_execution_snapshot_valid" | "delegated_execution_snapshot_fingerprint_mismatch">;
};
export declare function validateDelegatedExecutionSnapshot(snapshot: DelegatedExecutionSnapshot, expected?: {
    commandRequestId: string;
    subSessionId: string;
    agentId: string;
    promptBundleId: string;
}): {
    valid: boolean;
    reasonCode: "delegated_execution_snapshot_valid" | "delegated_execution_snapshot_runtime_mismatch" | "delegated_execution_snapshot_fingerprint_mismatch";
};
//# sourceMappingURL=delegated-execution-snapshot.d.ts.map