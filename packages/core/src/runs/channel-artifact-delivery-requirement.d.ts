import type { ChannelSource } from "../channels/contracts.js";
import type { AnyTool } from "../tools/types.js";
import type { CanonicalArtifactDeliveryCapabilityRequirement } from "./canonical-self-solve-capability-planning.js";
type DeliveryCapabilityTool = Pick<AnyTool, "availableSources" | "channelCapability" | "name">;
export type ChannelArtifactDeliveryRequirementResult = {
    ok: true;
    requirement?: CanonicalArtifactDeliveryCapabilityRequirement;
} | {
    ok: false;
    reasonCode: "channel_delivery_capability_missing" | "channel_delivery_capability_ambiguous" | "channel_delivery_destination_missing";
};
export declare function buildChannelArtifactDeliveryExecutionTargetRef(source: ChannelSource, destinationId: string): string;
/**
 * Verify the opaque destination binding without recovering the channel's raw
 * destination ID.  Execution code uses this only after capability admission;
 * it does not infer delivery intent from user text or a Tool name.
 */
export declare function isChannelArtifactDeliveryExecutionTargetRef(source: ChannelSource, targetRef: string): boolean;
export declare function resolveChannelArtifactDeliveryRequirement(input: {
    required: boolean;
    source: ChannelSource;
    destinationId: string;
    ownerAgentId: string;
    tools: readonly DeliveryCapabilityTool[];
}): ChannelArtifactDeliveryRequirementResult;
export {};
//# sourceMappingURL=channel-artifact-delivery-requirement.d.ts.map