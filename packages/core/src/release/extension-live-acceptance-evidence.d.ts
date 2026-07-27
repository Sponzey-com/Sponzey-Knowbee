import type { ExtensionLiveSmokeSummary } from "../runs/extension-live-smoke.js";
import type { LiveAcceptanceEvidence } from "./live-acceptance-admission.js";
export type ExtensionLiveEvidenceRejectionCode = "extension_smoke_not_live" | "extension_smoke_run_not_passed" | "extension_smoke_scenario_duplicate" | "extension_smoke_result_not_verified" | "extension_smoke_read_only_required" | "extension_smoke_selection_mismatch" | "extension_smoke_run_correlation_invalid" | "extension_smoke_discovery_only" | "extension_smoke_tool_receipt_missing" | "extension_smoke_tool_receipt_mismatch" | "extension_smoke_tool_not_succeeded" | "extension_smoke_llm_diagnosis_missing" | "extension_smoke_llm_diagnosis_invalid" | "extension_smoke_evidence_binding_invalid" | "extension_smoke_audit_missing" | "extension_smoke_unredacted";
export interface ExtensionLiveEvidenceRejection {
    scenarioId: string;
    capability: "skill" | "mcp";
    reasonCode: ExtensionLiveEvidenceRejectionCode;
}
export interface ExtensionLiveEvidenceProductionResult {
    accepted: LiveAcceptanceEvidence[];
    rejected: ExtensionLiveEvidenceRejection[];
}
export declare function produceExtensionLiveAcceptanceEvidence(run: ExtensionLiveSmokeSummary): ExtensionLiveEvidenceProductionResult;
//# sourceMappingURL=extension-live-acceptance-evidence.d.ts.map