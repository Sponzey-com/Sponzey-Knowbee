import { runLlmSolutionPlanProviderWithRepair, } from "../contracts/llm-solution-plan-provider.js";
import { createSolutionPlanCapabilityExecutionScope, } from "./run-scoped-tool-admission.js";
import { buildSolutionPlanCapabilityAdmission, } from "./solution-plan-capability-admission.js";
function executableCapabilityRefs(policy) {
    const targetId = policy.input.constraints.targetId?.trim();
    return [
        ...new Set(policy.input.capabilitySnapshot.bindings
            .filter((binding) => binding.risk !== "denied" &&
            !binding.capabilityId.trim().startsWith("action:") &&
            (!targetId || binding.targetId.trim() === targetId))
            .map((binding) => binding.capabilityId.trim())
            .filter(Boolean)
            .map((capabilityId) => `capability:${capabilityId}`)),
    ].sort();
}
export async function planCanonicalSelfSolveCapabilities(input) {
    const capabilityRefs = executableCapabilityRefs(input.policy);
    if (capabilityRefs.length === 0) {
        return { ok: false, reasonCode: "solution_plan_capability_refs_missing" };
    }
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
            ...input.policy.input.constraints.requestedMethods.map((method) => `requested_method:${method}`),
            ...input.policy.input.constraints.exclusiveMethods.map((method) => `exclusive_method:${method}`),
        ],
        capabilityRefs,
        completionCriteria: input.intake.structured_request.complete_condition,
    });
    if (planned.status !== "valid") {
        return { ok: false, reasonCode: planned.reasonCode };
    }
    const admitted = buildSolutionPlanCapabilityAdmission({
        runId: input.runId,
        solutionPlanReceiptId: planned.receipt.receiptId,
        policyReceiptId: input.policy.descriptor.receiptId,
        capabilitySnapshot: input.policy.input.capabilitySnapshot,
        selections: planned.capabilitySelections,
        ...(input.policy.input.constraints.targetId
            ? { targetId: input.policy.input.constraints.targetId }
            : {}),
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