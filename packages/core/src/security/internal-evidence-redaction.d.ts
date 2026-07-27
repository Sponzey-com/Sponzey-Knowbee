export declare const INTERNAL_EVIDENCE_REDACTION_MASK = "[internal-evidence-redacted]";
export interface InternalEvidenceRedactionOptions {
    replacement?: string;
    onRedaction?: (match: string) => void;
}
export declare function redactInternalEvidenceText(raw: string, options?: InternalEvidenceRedactionOptions): string;
export declare function containsInternalEvidenceText(raw: string): boolean;
export declare function isInternalEvidenceKey(key: string): boolean;
//# sourceMappingURL=internal-evidence-redaction.d.ts.map