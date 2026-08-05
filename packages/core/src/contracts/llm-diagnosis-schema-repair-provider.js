import { gateLlmDiagnosisOutput, } from "./llm-diagnosis-gate.js";
export async function runDiagnosisSchemaRepairProvider(input) {
    const rawOutput = await input.provider.repairDiagnosis({
        target: input.target,
        invalidRawOutput: input.invalidRawOutput,
        validationIssues: input.validationIssues,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        stepId: input.stepId,
    });
    return gateLlmDiagnosisOutput({
        target: input.target,
        rawOutput,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        failedStepId: input.stepId,
        failedInputRefs: [`llm-output:repaired_${input.target}`],
        failedStrategy: "schema_repair",
        repairAttempted: true,
        ...(input.receiptBinding ? { receiptBinding: input.receiptBinding } : {}),
    });
}
export async function resolveLlmDiagnosisWithOneShotRepair(input) {
    const initial = gateLlmDiagnosisOutput({
        target: input.target,
        rawOutput: input.rawOutput,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        failedStepId: input.stepId,
        failedInputRefs: [`llm-output:initial_${input.target}`],
        failedStrategy: "initial_llm_diagnosis",
        repairAttempted: false,
        ...(input.subject ? { receiptBinding: input.subject } : {}),
    });
    if (initial.status === "valid")
        return { ...initial, repairAttempted: false };
    if (initial.status === "blocked")
        return { ...initial, repairAttempted: true };
    const repaired = await runDiagnosisSchemaRepairProvider({
        provider: input.provider,
        target: input.target,
        invalidRawOutput: input.rawOutput,
        validationIssues: initial.repairDecision.validationIssues,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        stepId: input.stepId,
        ...(input.subject ? { receiptBinding: input.subject } : {}),
    });
    if (repaired.status === "repair_required") {
        throw new Error("One-shot diagnosis repair returned an impossible second repair request.");
    }
    return repaired.status === "valid"
        ? { ...repaired, repairAttempted: true }
        : { ...repaired, repairAttempted: true };
}
//# sourceMappingURL=llm-diagnosis-schema-repair-provider.js.map