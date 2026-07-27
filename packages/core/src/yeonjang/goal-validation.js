import { runResultDiagnosisProvider, } from "../contracts/llm-diagnosis-provider.js";
import { authorizeDiagnosisActionRoute } from "../contracts/diagnosis-action-routing.js";
import { buildYeonjangGoalValidatedPostCheck, } from "./evidence.js";
export async function validateYeonjangGoalWithLlm(input) {
    try {
        const evidenceRefs = input.evidenceRefs.map((ref) => ref.trim()).filter(Boolean);
        const diagnosed = await runResultDiagnosisProvider({
            provider: input.provider,
            ownerAgentName: input.ownerAgentName,
            resultSummary: `${input.toolName}: ${input.publicToolOutput}`.trim(),
            expectedOutput: input.expectedOutput,
            evidence: [
                `user_request_summary: ${input.userRequestSummary}`,
                `sanitized_observed_state: ${input.sanitizedObservedStateSummary}`,
                ...evidenceRefs.map((ref) => `evidence_ref: ${ref}`),
            ],
            risks: input.risks ?? [],
            ...(input.workId ? { workId: input.workId } : {}),
            stepId: input.stepId,
            evidenceSourceKind: "tool",
            repairAttempted: false,
            diagnosisSubjectKind: "tool_result",
        });
        if (diagnosed.status !== "valid" || diagnosed.target !== "result_diagnosis") {
            return { status: "not_validated", reasonCode: "result_diagnosis_invalid" };
        }
        if (!diagnosed.receipt) {
            return {
                status: "not_validated",
                reasonCode: "result_diagnosis_receipt_missing",
                diagnosis: diagnosed.diagnosis,
            };
        }
        if (diagnosed.diagnosis.sufficiency !== "sufficient") {
            return {
                status: "not_validated",
                reasonCode: "result_diagnosis_not_sufficient",
                diagnosis: diagnosed.diagnosis,
                receipt: diagnosed.receipt,
            };
        }
        if (diagnosed.diagnosis.recommended_action !== "final_report") {
            return {
                status: "not_validated",
                reasonCode: "result_diagnosis_action_not_final",
                diagnosis: diagnosed.diagnosis,
                receipt: diagnosed.receipt,
            };
        }
        if (diagnosed.diagnosis.missing_information.length > 0 ||
            diagnosed.diagnosis.conflicts.length > 0) {
            return {
                status: "not_validated",
                reasonCode: "result_diagnosis_has_gaps",
                diagnosis: diagnosed.diagnosis,
                receipt: diagnosed.receipt,
            };
        }
        try {
            authorizeDiagnosisActionRoute({
                receipt: diagnosed.receipt,
                subjectPayload: {
                    ownerAgentName: input.ownerAgentName,
                    resultSummary: `${input.toolName}: ${input.publicToolOutput}`.trim(),
                    expectedOutput: input.expectedOutput,
                    evidence: [
                        `user_request_summary: ${input.userRequestSummary}`,
                        `sanitized_observed_state: ${input.sanitizedObservedStateSummary}`,
                        ...evidenceRefs.map((ref) => `evidence_ref: ${ref}`),
                    ],
                    risks: input.risks ?? [],
                    ...(input.workId ? { workId: input.workId } : {}),
                    stepId: input.stepId,
                    evidenceSourceKind: "tool",
                },
                diagnosis: diagnosed.diagnosis,
            });
        }
        catch {
            return {
                status: "not_validated",
                reasonCode: "result_diagnosis_route_invalid",
                diagnosis: diagnosed.diagnosis,
                receipt: diagnosed.receipt,
            };
        }
        return {
            status: "validated",
            diagnosis: diagnosed.diagnosis,
            receipt: diagnosed.receipt,
            postCheck: buildYeonjangGoalValidatedPostCheck({
                diagnosisReceiptId: diagnosed.receipt.receiptId,
                diagnosisSubjectKind: "tool_result",
                evidenceRefs,
            }),
        };
    }
    catch {
        return { status: "not_validated", reasonCode: "result_diagnosis_provider_failed" };
    }
}
//# sourceMappingURL=goal-validation.js.map