import type { PersistedChannelSmokeRunResult } from "../channels/smoke-runner.js";
import type { LiveAcceptanceEvidence } from "./live-acceptance-admission.js";
export type ChannelLiveEvidenceRejectionCode = "channel_smoke_not_live" | "channel_smoke_run_not_passed" | "channel_smoke_result_not_passed" | "channel_smoke_scenario_unsupported" | "channel_smoke_scenario_duplicate" | "channel_smoke_audit_missing" | "channel_smoke_channel_mismatch" | "channel_smoke_provider_direct" | "channel_smoke_correlation_invalid";
export interface ChannelLiveEvidenceRejection {
    scenarioId: string;
    reasonCode: ChannelLiveEvidenceRejectionCode;
}
export interface ChannelLiveEvidenceProductionResult {
    accepted: LiveAcceptanceEvidence[];
    rejected: ChannelLiveEvidenceRejection[];
}
export declare function produceChannelLiveAcceptanceEvidence(run: PersistedChannelSmokeRunResult): ChannelLiveEvidenceProductionResult;
//# sourceMappingURL=channel-live-acceptance-evidence.d.ts.map