export function decideInvalidStructuredRecordRepair(input) {
    if (!input.repairAttempted) {
        return {
            action: "attempt_schema_repair",
            reasonCode: "invalid_structured_record",
            target: input.target,
            ownerAgentName: input.ownerAgentName,
            ...(input.workId ? { workId: input.workId } : {}),
            failedStepId: input.failedStepId,
            repairAttemptNumber: 1,
            validationIssues: input.validationIssues,
        };
    }
    return {
        action: "block_step",
        reasonCode: "invalid_structured_record",
        target: input.target,
        ownerAgentName: input.ownerAgentName,
        ...(input.workId ? { workId: input.workId } : {}),
        failureDiagnosis: {
            failed_step_id: input.failedStepId,
            failure_reason: "invalid_structured_record",
            failed_input_refs: input.failedInputRefs,
            failed_strategy: input.failedStrategy,
            recoverable: false,
        },
        stopCondition: "invalid_structured_record_after_schema_repair",
        validationIssues: input.validationIssues,
    };
}
//# sourceMappingURL=structured-record-repair.js.map