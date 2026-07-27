import { gateLlmDiagnosisOutput, } from "./llm-diagnosis-gate.js";
import { runDiagnosisSchemaRepairProvider, } from "./llm-diagnosis-schema-repair-provider.js";
export async function runRequestDiagnosisProvider(input) {
    const subjectPayload = {
        ownerAgentName: input.ownerAgentName,
        userRequestSummary: input.userRequestSummary,
        context: input.context,
        constraints: input.constraints,
        ...(input.workId ? { workId: input.workId } : {}),
        stepId: input.stepId,
    };
    const rawOutput = await input.provider.diagnoseRequest(subjectPayload);
    return gateLlmDiagnosisOutput({
        target: "request_diagnosis",
        rawOutput,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        failedStepId: input.stepId,
        failedInputRefs: ["llm-output:request_diagnosis"],
        failedStrategy: input.repairAttempted ? "schema_repair" : "initial_llm_diagnosis",
        repairAttempted: input.repairAttempted,
        receiptBinding: {
            receiptId: `diagnosis:${input.workId ?? "unscoped"}:${input.stepId}:request`,
            subjectKind: "user_request",
            subjectPayload,
        },
    });
}
export async function runRequestDiagnosisProviderWithRepair(input) {
    const subjectPayload = {
        ownerAgentName: input.ownerAgentName,
        userRequestSummary: input.userRequestSummary,
        context: input.context,
        constraints: input.constraints,
        ...(input.workId ? { workId: input.workId } : {}),
        stepId: input.stepId,
    };
    const rawOutput = await input.provider.diagnoseRequest(subjectPayload);
    const receiptBinding = {
        receiptId: `diagnosis:${input.workId ?? "unscoped"}:${input.stepId}:request`,
        subjectKind: "user_request",
        subjectPayload,
    };
    const initialResult = gateLlmDiagnosisOutput({
        target: "request_diagnosis",
        rawOutput,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        failedStepId: input.stepId,
        failedInputRefs: ["llm-output:request_diagnosis"],
        failedStrategy: "initial_llm_diagnosis",
        repairAttempted: false,
        receiptBinding,
    });
    if (initialResult.status !== "repair_required")
        return initialResult;
    return runDiagnosisSchemaRepairProvider({
        provider: input.repairProvider,
        target: "request_diagnosis",
        invalidRawOutput: rawOutput,
        validationIssues: initialResult.repairDecision.validationIssues,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        stepId: input.stepId,
        receiptBinding,
    });
}
export async function runResultDiagnosisProvider(input) {
    const subjectPayload = {
        ownerAgentName: input.ownerAgentName,
        resultSummary: input.resultSummary,
        expectedOutput: input.expectedOutput,
        evidence: input.evidence,
        risks: input.risks,
        ...(input.workId ? { workId: input.workId } : {}),
        stepId: input.stepId,
        ...(input.evidenceSourceKind ? { evidenceSourceKind: input.evidenceSourceKind } : {}),
    };
    const rawOutput = await input.provider.diagnoseResult(subjectPayload);
    return gateLlmDiagnosisOutput({
        target: "result_diagnosis",
        rawOutput,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        failedStepId: input.stepId,
        failedInputRefs: ["llm-output:result_diagnosis"],
        failedStrategy: input.repairAttempted ? "schema_repair" : "initial_llm_result_diagnosis",
        repairAttempted: input.repairAttempted,
        receiptBinding: {
            receiptId: `diagnosis:${input.workId ?? "unscoped"}:${input.stepId}:result`,
            subjectKind: input.diagnosisSubjectKind ?? "validation_result",
            subjectPayload,
        },
    });
}
export async function runResultDiagnosisProviderWithRepair(input) {
    const subjectPayload = {
        ownerAgentName: input.ownerAgentName,
        resultSummary: input.resultSummary,
        expectedOutput: input.expectedOutput,
        evidence: input.evidence,
        risks: input.risks,
        ...(input.workId ? { workId: input.workId } : {}),
        stepId: input.stepId,
        ...(input.evidenceSourceKind ? { evidenceSourceKind: input.evidenceSourceKind } : {}),
    };
    const rawOutput = await input.provider.diagnoseResult(subjectPayload);
    const receiptBinding = {
        receiptId: `diagnosis:${input.workId ?? "unscoped"}:${input.stepId}:result`,
        subjectKind: input.diagnosisSubjectKind ?? "validation_result",
        subjectPayload,
    };
    const initialResult = gateLlmDiagnosisOutput({
        target: "result_diagnosis",
        rawOutput,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        failedStepId: input.stepId,
        failedInputRefs: ["llm-output:result_diagnosis"],
        failedStrategy: "initial_llm_result_diagnosis",
        repairAttempted: false,
        receiptBinding,
    });
    if (initialResult.status !== "repair_required")
        return initialResult;
    return runDiagnosisSchemaRepairProvider({
        provider: input.repairProvider,
        target: "result_diagnosis",
        invalidRawOutput: rawOutput,
        validationIssues: initialResult.repairDecision.validationIssues,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        stepId: input.stepId,
        receiptBinding,
    });
}
//# sourceMappingURL=llm-diagnosis-provider.js.map