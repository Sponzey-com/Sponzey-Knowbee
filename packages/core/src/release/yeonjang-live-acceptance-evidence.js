import { isYeonjangLiveSmokeReadOnlyMethod, } from "../runs/yeonjang-live-smoke.js";
const SHA256_FINGERPRINT = /^sha256:[a-f0-9]{64}$/u;
const REQUIRED_DIAGNOSIS_CRITERIA = [
    "existence",
    "accuracy",
    "target_match",
    "constraint_compliance",
];
export function produceYeonjangLiveAcceptanceEvidence(input) {
    const accepted = [];
    const rejected = [];
    const seen = new Set();
    for (const result of input.run.results) {
        const scenario = result.scenario;
        const trace = result.trace;
        const instance = trace?.instance;
        const command = trace?.command;
        const observed = trace?.observedResult;
        const diagnosis = trace?.resultDiagnosis;
        let reasonCode;
        if (input.run.mode !== "live-run")
            reasonCode = "yeonjang_smoke_not_live";
        else if (input.run.status !== "passed")
            reasonCode = "yeonjang_smoke_run_not_passed";
        else if (seen.has(scenario.id))
            reasonCode = "yeonjang_smoke_scenario_duplicate";
        else if (result.state !== "verified" || result.status !== "passed") {
            reasonCode = "yeonjang_smoke_result_not_verified";
        }
        else if (!isYeonjangLiveSmokeReadOnlyMethod(scenario.expectedMethod) ||
            scenario.readOnly !== true) {
            reasonCode = "yeonjang_smoke_read_only_method_required";
        }
        else if (!trace || !instance)
            reasonCode = "yeonjang_smoke_trace_missing";
        else if (instance.duplicateActiveIdentityCount !== 0) {
            reasonCode = "yeonjang_smoke_instance_duplicate";
        }
        else if (instance.status !== "connected") {
            reasonCode = "yeonjang_smoke_instance_not_connected";
        }
        else if (instance.trustState !== "trusted") {
            reasonCode = "yeonjang_smoke_instance_untrusted";
        }
        else if (!instance.runnableTarget) {
            reasonCode = "yeonjang_smoke_instance_not_runnable";
        }
        else if (input.maxSessionAgeMs <= 0 ||
            instance.observedAt > input.now ||
            input.now - instance.observedAt > input.maxSessionAgeMs) {
            reasonCode = "yeonjang_smoke_session_stale";
        }
        else if (instance.instanceId !== scenario.expectedInstanceId ||
            instance.sessionId !== scenario.expectedSessionId) {
            reasonCode = "yeonjang_smoke_target_mismatch";
        }
        else if (trace.requestGroupId !== input.run.runId) {
            reasonCode = "yeonjang_smoke_run_correlation_invalid";
        }
        else if (!command)
            reasonCode = "yeonjang_smoke_command_missing";
        else if (command.runId !== input.run.runId ||
            command.requestGroupId !== input.run.runId ||
            command.instanceId !== scenario.expectedInstanceId ||
            command.sessionId !== scenario.expectedSessionId ||
            command.method !== scenario.expectedMethod ||
            !command.readOnly) {
            reasonCode = "yeonjang_smoke_command_mismatch";
        }
        else if (command.deliveryStatus !== "acked") {
            reasonCode = "yeonjang_smoke_command_not_acked";
        }
        else if (!observed)
            reasonCode = "yeonjang_smoke_observed_result_missing";
        else if (observed.runId !== input.run.runId ||
            observed.commandId !== command.commandId ||
            observed.instanceId !== scenario.expectedInstanceId ||
            observed.sessionId !== scenario.expectedSessionId ||
            observed.status !== "observed") {
            reasonCode = "yeonjang_smoke_observed_result_mismatch";
        }
        else if (!diagnosis)
            reasonCode = "yeonjang_smoke_llm_diagnosis_missing";
        else if (diagnosis.diagnosedBy !== "llm" ||
            diagnosis.status !== "complete" ||
            !SHA256_FINGERPRINT.test(diagnosis.contextFingerprint) ||
            diagnosis.evidenceRefs.length === 0 ||
            REQUIRED_DIAGNOSIS_CRITERIA.some((criterion) => !diagnosis.criterionKeys.includes(criterion))) {
            reasonCode = "yeonjang_smoke_llm_diagnosis_invalid";
        }
        else if (!observed.evidenceRef.trim() ||
            diagnosis.evidenceRefs.length !== 1 ||
            diagnosis.evidenceRefs[0] !== observed.evidenceRef) {
            reasonCode = "yeonjang_smoke_evidence_binding_invalid";
        }
        else if (!trace.auditEventId?.trim())
            reasonCode = "yeonjang_smoke_audit_missing";
        else if (trace.redactionStatus !== "verified")
            reasonCode = "yeonjang_smoke_unredacted";
        else {
            accepted.push({
                evidenceRef: `yeonjang-smoke:${input.run.runId}:${scenario.id}`,
                capability: "yeonjang",
                scenarioId: scenario.id,
                terminalStatus: "passed",
                auditEventId: trace.auditEventId,
                executedAt: result.finishedAt,
                redactionStatus: "verified",
            });
        }
        seen.add(scenario.id);
        if (reasonCode)
            rejected.push({ scenarioId: scenario.id, reasonCode });
    }
    return { accepted, rejected };
}
//# sourceMappingURL=yeonjang-live-acceptance-evidence.js.map