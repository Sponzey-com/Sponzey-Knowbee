export type LiveAcceptanceCapability = "webui" | "telegram" | "slack" | "web" | "skill" | "mcp" | "yeonjang";
export type ReleaseAudience = "public" | "internal";
export interface LiveAcceptanceEvidence {
    evidenceRef: string;
    capability: LiveAcceptanceCapability;
    scenarioId: string;
    terminalStatus: "passed" | "failed";
    auditEventId: string;
    executedAt: number;
    redactionStatus: "verified" | "unverified";
}
export interface LiveAcceptanceAdmissionInput {
    audience: ReleaseAudience;
    requiredCapabilities: readonly LiveAcceptanceCapability[];
    evidence: readonly LiveAcceptanceEvidence[];
    now: number;
    maxAgeMs: number;
}
export interface LiveAcceptanceAdmissionResult {
    status: "admitted" | "blocked" | "warning";
    reasonCodes: string[];
    acceptedEvidenceRefs: string[];
}
export declare function admitLiveAcceptance(input: LiveAcceptanceAdmissionInput): LiveAcceptanceAdmissionResult;
//# sourceMappingURL=live-acceptance-admission.d.ts.map