import type { ApprovalOperationBinding } from "../runs/approval-registry.js";
import type { AnyTool, ToolContext } from "./types.js";
export interface ApprovedArtifactDeliveryOperation {
    readonly binding: ApprovalOperationBinding;
    readonly artifactRef: string;
    readonly targetFingerprint: `sha256:${string}`;
    readonly authorizationParams: Readonly<{
        operationId: string;
        operationBindingHash: `sha256:${string}`;
        artifactRef: string;
        targetFingerprint: `sha256:${string}`;
    }>;
}
export type ResolveApprovedArtifactDeliveryOperationResult = {
    readonly status: "not_required";
} | {
    readonly status: "rejected";
    readonly reasonCode: "approved_artifact_delivery_channel_mismatch" | "approved_artifact_delivery_ref_required";
} | {
    readonly status: "resolved";
    readonly operation: ApprovedArtifactDeliveryOperation;
};
export declare function resolveApprovedArtifactDeliveryOperation(input: {
    tool: Pick<AnyTool, "name" | "channelCapability">;
    params: Readonly<Record<string, unknown>>;
    ctx: Pick<ToolContext, "runId" | "requestGroupId" | "sessionId" | "source">;
}): ResolveApprovedArtifactDeliveryOperationResult;
//# sourceMappingURL=approved-artifact-delivery-operation.d.ts.map