const SHA256_FINGERPRINT = /^sha256:[a-f0-9]{64}$/u;
const REQUIRED_DIAGNOSIS_CRITERIA = [
    "existence",
    "accuracy",
    "target_match",
    "constraint_compliance",
];
export function produceExtensionLiveAcceptanceEvidence(run) {
    const accepted = [];
    const rejected = [];
    const seen = new Set();
    for (const result of run.results) {
        const scenario = result.scenario;
        const trace = result.trace;
        const tool = trace?.toolExecution;
        const diagnosis = trace?.resultDiagnosis;
        let reasonCode;
        if (run.mode !== "live-run")
            reasonCode = "extension_smoke_not_live";
        else if (run.status !== "passed")
            reasonCode = "extension_smoke_run_not_passed";
        else if (seen.has(scenario.id))
            reasonCode = "extension_smoke_scenario_duplicate";
        else if (result.state !== "verified" || result.status !== "passed") {
            reasonCode = "extension_smoke_result_not_verified";
        }
        else if (!scenario.readOnly)
            reasonCode = "extension_smoke_read_only_required";
        else if (trace?.selectedCapability !== scenario.capability ||
            trace.selectedAgentId !== scenario.expectedAgentId ||
            trace.selectedBindingId !== scenario.expectedBindingId ||
            trace.selectedCatalogId !== scenario.expectedCatalogId) {
            reasonCode = "extension_smoke_selection_mismatch";
        }
        else if (trace.requestGroupId !== run.runId) {
            reasonCode = "extension_smoke_run_correlation_invalid";
        }
        else if (trace.discoveryOnly)
            reasonCode = "extension_smoke_discovery_only";
        else if (!tool)
            reasonCode = "extension_smoke_tool_receipt_missing";
        else if (tool.runId !== run.runId ||
            tool.requestGroupId !== run.runId ||
            tool.capability !== scenario.capability ||
            tool.agentId !== scenario.expectedAgentId ||
            tool.bindingId !== scenario.expectedBindingId ||
            tool.catalogId !== scenario.expectedCatalogId ||
            tool.toolName !== scenario.expectedToolName) {
            reasonCode = "extension_smoke_tool_receipt_mismatch";
        }
        else if (tool.status !== "succeeded" || !tool.executionObserved) {
            reasonCode = "extension_smoke_tool_not_succeeded";
        }
        else if (!diagnosis)
            reasonCode = "extension_smoke_llm_diagnosis_missing";
        else if (diagnosis.diagnosedBy !== "llm" ||
            diagnosis.status !== "complete" ||
            !SHA256_FINGERPRINT.test(diagnosis.contextFingerprint) ||
            diagnosis.evidenceRefs.length === 0 ||
            REQUIRED_DIAGNOSIS_CRITERIA.some((criterion) => !diagnosis.criterionKeys.includes(criterion))) {
            reasonCode = "extension_smoke_llm_diagnosis_invalid";
        }
        else if (!tool.evidenceRef.trim() ||
            diagnosis.evidenceRefs.length !== 1 ||
            diagnosis.evidenceRefs[0] !== tool.evidenceRef) {
            reasonCode = "extension_smoke_evidence_binding_invalid";
        }
        else if (!trace.auditEventId?.trim())
            reasonCode = "extension_smoke_audit_missing";
        else if (trace.redactionStatus !== "verified")
            reasonCode = "extension_smoke_unredacted";
        else {
            accepted.push({
                evidenceRef: `extension-smoke:${run.runId}:${scenario.id}`,
                capability: scenario.capability,
                scenarioId: scenario.id,
                terminalStatus: "passed",
                auditEventId: trace.auditEventId,
                executedAt: result.finishedAt,
                redactionStatus: "verified",
            });
        }
        seen.add(scenario.id);
        if (reasonCode)
            rejected.push({ scenarioId: scenario.id, capability: scenario.capability, reasonCode });
    }
    return { accepted, rejected };
}
//# sourceMappingURL=extension-live-acceptance-evidence.js.map