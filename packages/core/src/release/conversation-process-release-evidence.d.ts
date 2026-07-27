import type { PersistedChannelSmokeRunResult } from "../channels/smoke-runner.js";
export interface ConversationProcessReleaseCandidate {
    buildIdentity: string;
    run: PersistedChannelSmokeRunResult;
}
export interface ConversationProcessReleaseEvidence {
    schemaVersion: 1;
    status: "passed" | "blocked";
    buildIdentity: string;
    scenarioCount: number;
    channels: Array<{
        channel: "telegram" | "webui";
        passedCount: number;
        finishedAt: number;
        evidenceRef: string;
    }>;
    blockers: string[];
    checksum: string;
}
export interface BuildConversationProcessReleaseEvidenceInput {
    candidates: readonly ConversationProcessReleaseCandidate[];
    expectedBuildIdentity: string;
    now: number;
    maxAgeMs: number;
}
export declare function buildConversationProcessReleaseEvidence(input: BuildConversationProcessReleaseEvidenceInput): ConversationProcessReleaseEvidence;
//# sourceMappingURL=conversation-process-release-evidence.d.ts.map