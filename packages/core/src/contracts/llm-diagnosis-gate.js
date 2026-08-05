import { decideInvalidStructuredRecordRepair, } from "./structured-record-repair.js";
import { validateLlmRequestDiagnosisRecord, validateLlmResultDiagnosisRecord, } from "./work-record.js";
import { createLlmDiagnosisReceipt, } from "./diagnosis-action-routing.js";
export function gateLlmDiagnosisOutput(input) {
    const validation = input.target === "request_diagnosis"
        ? validateLlmRequestDiagnosisRecord(input.rawOutput)
        : validateLlmResultDiagnosisRecord(input.rawOutput);
    if (validation.ok) {
        const receipt = input.receiptBinding
            ? createLlmDiagnosisReceipt({
                receiptId: input.receiptBinding.receiptId,
                target: input.target,
                subjectKind: input.receiptBinding.subjectKind,
                subjectPayload: input.receiptBinding.subjectPayload,
                diagnosis: validation.value,
            })
            : undefined;
        return input.target === "request_diagnosis"
            ? {
                status: "valid",
                target: "request_diagnosis",
                diagnosis: validation.value,
                ...(receipt ? { receipt } : {}),
            }
            : {
                status: "valid",
                target: "result_diagnosis",
                diagnosis: validation.value,
                ...(receipt ? { receipt } : {}),
            };
    }
    const repairDecision = decideInvalidStructuredRecordRepair({
        target: input.target,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        failedStepId: input.failedStepId,
        failedInputRefs: input.failedInputRefs,
        failedStrategy: input.failedStrategy,
        validationIssues: validation.issues,
        repairAttempted: input.repairAttempted,
    });
    return repairDecision.action === "attempt_schema_repair"
        ? { status: "repair_required", target: input.target, repairDecision }
        : { status: "blocked", target: input.target, repairDecision };
}
//# sourceMappingURL=llm-diagnosis-gate.js.map