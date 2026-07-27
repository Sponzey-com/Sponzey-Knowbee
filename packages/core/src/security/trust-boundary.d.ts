import { type ChannelSource } from "../channels/contracts.js";
export declare const UNTRUSTED_EVIDENCE_SOURCE_KINDS: readonly ["web", "mcp", "skill", "yeonjang", "tool", "child", "memory", "file", "channel"];
export type UntrustedEvidenceSourceKind = typeof UNTRUSTED_EVIDENCE_SOURCE_KINDS[number];
export type UntrustedEvidenceOwnerType = "knowbee" | "sub_agent" | "team" | "system";
export type UntrustedEvidenceRedactionState = "redacted" | "not_required";
export type UntrustedEvidenceConsumptionPurpose = "prompt_context" | "memory_write" | "child_evidence" | "completion_evidence";
export interface UntrustedEvidenceOwnerScope {
    ownerType: UntrustedEvidenceOwnerType;
    ownerId: string;
}
export interface UntrustedEvidenceEnvelope {
    readonly schemaVersion: "untrusted-evidence-v1";
    readonly sourceKind: UntrustedEvidenceSourceKind;
    readonly sourceRef: string;
    readonly contentLabel: string;
    readonly ownerScope: Readonly<UntrustedEvidenceOwnerScope>;
    readonly trustClass: "untrusted_external";
    readonly instructionIsolation: "data_only";
    readonly redactionState: UntrustedEvidenceRedactionState;
    readonly contentFingerprint: string;
    readonly content: string;
}
export interface UntrustedEvidencePromptProjection {
    readonly role: "external_data";
    readonly policyAuthority: "none";
    readonly sourceKind: UntrustedEvidenceSourceKind;
    readonly sourceRef: string;
    readonly contentLabel: string;
    readonly trustClass: "untrusted_external";
    readonly instructionIsolation: "data_only";
    readonly redactionState: UntrustedEvidenceRedactionState;
    readonly contentFingerprint: string;
    readonly content: string;
}
export type UntrustedEvidenceConsumptionReasonCode = "untrusted_evidence_data_only" | "untrusted_evidence_owner_mismatch" | "untrusted_evidence_isolation_invalid" | "untrusted_evidence_redaction_incomplete" | "untrusted_evidence_provenance_missing" | "untrusted_evidence_instructional_memory_write";
export interface UntrustedEvidenceConsumptionDecision {
    readonly allowed: boolean;
    readonly reasonCode: UntrustedEvidenceConsumptionReasonCode;
    readonly sourceRef: string;
}
export interface UntrustedEvidenceRedactionResult {
    readonly content: string;
    readonly redacted: boolean;
}
export declare function redactUntrustedEvidenceContent(value: string): UntrustedEvidenceRedactionResult;
export declare function createUntrustedEvidenceEnvelope(input: {
    sourceKind: UntrustedEvidenceSourceKind;
    sourceRef: string;
    contentLabel?: string;
    ownerScope: UntrustedEvidenceOwnerScope;
    content: string;
    redactionState: UntrustedEvidenceRedactionState;
}): UntrustedEvidenceEnvelope;
export declare function projectUntrustedEvidenceForPrompt(envelope: UntrustedEvidenceEnvelope): UntrustedEvidencePromptProjection;
export declare function renderUntrustedEvidenceForPrompt(envelope: UntrustedEvidenceEnvelope): string;
export declare function evaluateUntrustedEvidenceConsumption(input: {
    envelope: UntrustedEvidenceEnvelope;
    purpose: UntrustedEvidenceConsumptionPurpose;
    expectedOwnerScope: UntrustedEvidenceOwnerScope;
}): UntrustedEvidenceConsumptionDecision;
export declare const TRUST_TAGS: readonly ["trusted", "user_input", "channel_input", "web_content", "file_content", "tool_result", "mcp_result", "capability_result", "yeonjang_result", "diagnostic"];
export type TrustTag = typeof TRUST_TAGS[number];
export interface TrustedContextBlock {
    id: string;
    tag: TrustTag;
    title: string;
    content: string;
    priority: "system" | "policy" | "context" | "evidence";
    sourceRef?: string;
}
export declare function isUntrustedTag(tag: TrustTag): boolean;
export declare function sourceToTrustTag(source: ChannelSource): TrustTag;
export declare function createContextBlock(params: {
    id: string;
    tag: TrustTag;
    title: string;
    content: string;
    priority?: TrustedContextBlock["priority"];
    sourceRef?: string;
}): TrustedContextBlock;
export declare function containsPromptInjectionDirective(content: string): boolean;
export declare function renderContextBlockForPrompt(block: TrustedContextBlock): string;
export declare function validatePromptAssemblyBlocks(blocks: TrustedContextBlock[]): {
    ok: boolean;
    violations: string[];
};
export declare function shouldBlockUntrustedMemoryWriteback(block: TrustedContextBlock): boolean;
//# sourceMappingURL=trust-boundary.d.ts.map