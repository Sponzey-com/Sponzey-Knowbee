import { runLlmSolutionPlanProviderWithRepair, } from "../contracts/llm-solution-plan-provider.js";
import { createSolutionPlanCapabilityExecutionScope, } from "./run-scoped-tool-admission.js";
import { buildSolutionPlanCapabilityAdmission, } from "./solution-plan-capability-admission.js";
import { buildChannelArtifactDeliveryExecutionTargetRef, } from "./channel-artifact-delivery-requirement.js";
function executableCapabilityTargetId(policy, ownerAgentId, goalCapabilityId) {
    const requestedTargetId = policy.input.constraints.targetId?.trim();
    if (!requestedTargetId)
        return undefined;
    const executableBindings = policy.input.capabilitySnapshot.bindings.filter((binding) => binding.risk !== "denied" &&
        !binding.capabilityId.trim().startsWith("action:"));
    const executableTargetIds = new Set(executableBindings.map((binding) => binding.targetId.trim()).filter(Boolean));
    const goalTargetIds = new Set(executableBindings
        .filter((binding) => binding.capabilityId.trim() === goalCapabilityId)
        .map((binding) => binding.targetId.trim())
        .filter(Boolean));
    if (goalTargetIds.has(requestedTargetId))
        return requestedTargetId;
    if (goalTargetIds.size === 1)
        return [...goalTargetIds][0];
    if (executableTargetIds.has(requestedTargetId))
        return requestedTargetId;
    const normalizedOwnerAgentId = ownerAgentId.trim();
    return executableTargetIds.has(normalizedOwnerAgentId)
        ? normalizedOwnerAgentId
        : requestedTargetId;
}
function executableCapabilityRefs(policy, capabilityTargetId, selectedCapabilityIds) {
    const selectedCapabilityIdSet = new Set(selectedCapabilityIds.map((value) => value.trim()).filter(Boolean));
    return [
        ...new Set(policy.input.capabilitySnapshot.bindings
            .filter((binding) => binding.risk !== "denied" &&
            !binding.capabilityId.trim().startsWith("action:") &&
            (selectedCapabilityIdSet.size === 0 ||
                selectedCapabilityIdSet.has(binding.capabilityId.trim())) &&
            (!capabilityTargetId ||
                binding.targetId.trim() === capabilityTargetId))
            .map((binding) => binding.capabilityId.trim())
            .filter(Boolean)
            .map((capabilityId) => `capability:${capabilityId}`)),
    ].sort();
}
export async function planCanonicalSelfSolveCapabilities(input) {
    const goalCapabilityId = input.intake.execution.execution_semantics.approvalTool.trim();
    const constrainedCapabilityIds = [
        ...new Set((input.policy.input.constraints.exclusiveMethods.length > 0
            ? input.policy.input.constraints.exclusiveMethods
            : input.policy.input.constraints.requestedMethods)
            .map((value) => value.trim())
            .filter(Boolean)),
    ];
    const selectedCapabilityIds = constrainedCapabilityIds.length > 0
        ? constrainedCapabilityIds
        : input.policy.input.capabilitySnapshot.bindings.some((binding) => binding.capabilityId.trim() === goalCapabilityId &&
            binding.risk !== "denied")
            ? [goalCapabilityId]
            : [];
    const primaryCapabilityId = selectedCapabilityIds[0] ?? goalCapabilityId;
    const capabilityTargetId = executableCapabilityTargetId(input.policy, input.ownerAgentId, primaryCapabilityId);
    const goalCapabilityRefs = executableCapabilityRefs(input.policy, capabilityTargetId, selectedCapabilityIds);
    if (selectedCapabilityIds.length > 0 &&
        goalCapabilityRefs.length !== selectedCapabilityIds.length) {
        return {
            ok: false,
            reasonCode: "solution_plan_selected_capability_unavailable",
        };
    }
    const deliveryRequirement = input.artifactDeliveryRequirement;
    const deliveryCapabilityRef = deliveryRequirement?.capabilityRef.trim() ?? "";
    const deliveryCapabilityId = deliveryCapabilityRef.startsWith("capability:")
        ? deliveryCapabilityRef.slice("capability:".length).trim()
        : "";
    const deliveryCapabilityAvailable = Boolean(deliveryRequirement &&
        deliveryCapabilityId &&
        deliveryRequirement.bindingTargetId.trim() &&
        deliveryRequirement.executionTargetId.trim() &&
        input.policy.input.capabilitySnapshot.bindings.some((binding) => binding.capabilityId.trim() === deliveryCapabilityId &&
            binding.targetId.trim() === deliveryRequirement.bindingTargetId.trim() &&
            binding.risk !== "denied"));
    if (deliveryRequirement && !deliveryCapabilityAvailable) {
        return { ok: false, reasonCode: "solution_plan_delivery_capability_unavailable" };
    }
    const capabilityRefs = [
        ...new Set([
            ...goalCapabilityRefs,
            ...(deliveryCapabilityAvailable ? [deliveryCapabilityRef] : []),
        ]),
    ].sort();
    if (capabilityRefs.length === 0) {
        return { ok: false, reasonCode: "solution_plan_capability_refs_missing" };
    }
    const requiredCapabilityRef = `capability:${goalCapabilityId}`;
    const selectedCapabilityRefs = selectedCapabilityIds.map((capabilityId) => `capability:${capabilityId}`);
    const requiredCapabilityRefs = [
        ...new Set([
            ...selectedCapabilityRefs.filter((capabilityRef) => capabilityRefs.includes(capabilityRef)),
            ...(requiredCapabilityRef && capabilityRefs.includes(requiredCapabilityRef)
                ? [requiredCapabilityRef]
                : []),
            ...(deliveryCapabilityAvailable ? [deliveryCapabilityRef] : []),
        ]),
    ].sort();
    const capabilityMetadata = new Map((input.capabilityMetadata ?? []).map((metadata) => [
        metadata.capabilityId.trim(),
        metadata,
    ]));
    const capabilityOptions = capabilityRefs.flatMap((capabilityRef) => {
        const capabilityId = capabilityRef.slice("capability:".length);
        const metadata = capabilityMetadata.get(capabilityId);
        if (!metadata?.description.trim())
            return [];
        const matchingBindings = input.policy.input.capabilitySnapshot.bindings.filter((binding) => binding.capabilityId.trim() === capabilityId);
        const risk = matchingBindings.some((binding) => binding.risk === "approval_required")
            ? "approval_required"
            : "safe";
        return [{
                capabilityRef,
                description: metadata.description.trim(),
                risk,
                effectClass: metadata.effectClass,
            }];
    });
    const planned = await runLlmSolutionPlanProviderWithRepair({
        provider: input.provider,
        ...(input.repairProvider ? { repairProvider: input.repairProvider } : {}),
        workId: input.policy.input.workId,
        runId: input.runId,
        ownerAgentName: input.ownerAgentName,
        requestDiagnosisReceiptId: input.requestDiagnosisReceiptId,
        requestDiagnosisIssuedAt: input.requestDiagnosisIssuedAt,
        issuedAt: input.issuedAt,
        goal: input.intake.structured_request.normalized_english.trim() ||
            input.intake.intent.summary.trim(),
        constraints: [
            ...input.intake.structured_request.context,
            ...(input.policy.input.constraints.targetId?.trim()
                ? [`target_instance:${input.policy.input.constraints.targetId.trim()}`]
                : []),
            ...(input.intake.execution.execution_semantics.approvalRequired
                ? [
                    `approval_tool:${input.intake.execution.execution_semantics.approvalTool}`,
                ]
                : []),
            ...input.policy.input.constraints.approvedCapabilityIds.map((capabilityId) => `approved_capability:${capabilityId}`),
            ...input.policy.input.constraints.requestedMethods.map((method) => `requested_method:${method}`),
            ...input.policy.input.constraints.exclusiveMethods.map((method) => `exclusive_method:${method}`),
        ],
        capabilityRefs,
        ...(capabilityOptions.length > 0 ? { capabilityOptions } : {}),
        requiredCapabilityRefs,
        completionCriteria: input.intake.structured_request.complete_condition,
    });
    if (planned.status !== "valid") {
        return {
            ok: false,
            reasonCode: planned.reasonCode,
            ...(planned.repairFailureReasonCode
                ? { repairFailureReasonCode: planned.repairFailureReasonCode }
                : {}),
        };
    }
    const channelSource = input.source?.trim() ?? "";
    const channelDestinationId = input.destinationId?.trim() ?? "";
    const selectedChannelDeliveryRefs = [
        ...new Set(planned.capabilitySelections.flatMap((selection) => {
            const metadata = capabilityMetadata.get(selection.capabilityRef.trim().slice("capability:".length));
            return metadata?.channelCapability?.kind === "direct_artifact_delivery"
                && metadata.channelCapability.channel === channelSource
                ? [selection.capabilityRef.trim()]
                : [];
        })),
    ];
    if (selectedChannelDeliveryRefs.length > 1) {
        return {
            ok: false,
            reasonCode: "solution_plan_channel_delivery_ambiguous",
            solutionPlanReceiptId: planned.receipt.receiptId,
            capabilitySelections: planned.capabilitySelections,
        };
    }
    const selectedChannelDeliveryRef = selectedChannelDeliveryRefs[0];
    if (selectedChannelDeliveryRef && (!channelSource || !channelDestinationId)) {
        return {
            ok: false,
            reasonCode: "solution_plan_channel_delivery_destination_missing",
            solutionPlanReceiptId: planned.receipt.receiptId,
            capabilitySelections: planned.capabilitySelections,
        };
    }
    const selectedChannelDeliveryTarget = selectedChannelDeliveryRef
        ? {
            bindingTargetId: input.ownerAgentId.trim(),
            executionTargetId: buildChannelArtifactDeliveryExecutionTargetRef(channelSource, channelDestinationId),
        }
        : undefined;
    const selectionTargets = deliveryCapabilityAvailable || selectedChannelDeliveryTarget
        ? Object.fromEntries(planned.capabilitySelections.map((selection) => {
            const selectionCapabilityRef = selection.capabilityRef.trim();
            const target = selectionCapabilityRef === deliveryCapabilityRef
                ? {
                    bindingTargetId: deliveryRequirement.bindingTargetId.trim(),
                    executionTargetId: deliveryRequirement.executionTargetId.trim(),
                }
                : selectionCapabilityRef === selectedChannelDeliveryRef
                    ? selectedChannelDeliveryTarget
                    : {
                        ...(capabilityTargetId
                            ? { bindingTargetId: capabilityTargetId }
                            : {}),
                        ...(input.policy.input.constraints.targetId?.trim()
                            ? {
                                executionTargetId: input.policy.input.constraints.targetId.trim(),
                            }
                            : {}),
                    };
            return [selection.stepId, target];
        }))
        : undefined;
    const admitted = buildSolutionPlanCapabilityAdmission({
        runId: input.runId,
        solutionPlanReceiptId: planned.receipt.receiptId,
        policyReceiptId: input.policy.descriptor.receiptId,
        capabilitySnapshot: input.policy.input.capabilitySnapshot,
        selections: planned.capabilitySelections,
        ...(capabilityTargetId
            ? { bindingTargetId: capabilityTargetId }
            : {}),
        ...(input.policy.input.constraints.targetId?.trim()
            ? {
                executionTargetId: input.policy.input.constraints.targetId.trim(),
            }
            : {}),
        ...(selectionTargets ? { selectionTargets } : {}),
        approvedCapabilityIds: input.policy.input.constraints.approvedCapabilityIds,
    });
    if (!admitted.ok) {
        return {
            ok: false,
            reasonCode: admitted.reasonCode,
            solutionPlanReceiptId: planned.receipt.receiptId,
            capabilitySelections: planned.capabilitySelections,
        };
    }
    const scope = createSolutionPlanCapabilityExecutionScope({
        descriptor: admitted.descriptor,
        ownerAgentId: input.ownerAgentId,
        skillDefinitions: input.skillDefinitions,
        skillBindings: input.skillBindings,
        instructionSkills: input.instructionSkills,
    });
    if (!scope.ok) {
        return {
            ok: false,
            reasonCode: scope.reasonCode,
            solutionPlanReceiptId: planned.receipt.receiptId,
            capabilitySelections: planned.capabilitySelections,
        };
    }
    return {
        ok: true,
        solutionPlanReceiptId: planned.receipt.receiptId,
        capabilitySelections: planned.capabilitySelections,
        admission: admitted.descriptor,
        scope: scope.scope,
    };
}
//# sourceMappingURL=canonical-self-solve-capability-planning.js.map