import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js";
import type { CanonicalWorkReceiptKind } from "../contracts/canonical-work-receipt.js";
import { type CanonicalAnalysisRevisionDescriptor } from "./canonical-analysis-revision.js";
import type { CanonicalIntakeDiagnosisDescriptor } from "./canonical-intake-diagnosis.js";
interface ConsumedAnalysisReceipt {
    kind: CanonicalWorkReceiptKind;
    evidenceFingerprint: string;
}
interface CanonicalIntakeAnalysisDependencies {
    loadAggregate: (workId: string) => CanonicalWorkAggregate | undefined;
    findLatestConsumedReceipt: (kind: "analysis_revision" | "diagnosis") => ConsumedAnalysisReceipt | undefined;
    recordDiagnosis: (descriptor: CanonicalIntakeDiagnosisDescriptor) => {
        ok: true;
    } | {
        ok: false;
        reasonCode: string;
    };
    recordRevision: (descriptor: CanonicalAnalysisRevisionDescriptor, expectedRevision: number) => {
        ok: true;
    } | {
        ok: false;
        reasonCode: string;
    };
}
export declare function recordCanonicalIntakeAnalysis(descriptor: CanonicalIntakeDiagnosisDescriptor, dependencies: CanonicalIntakeAnalysisDependencies): {
    ok: true;
} | {
    ok: false;
    reasonCode: string;
};
export {};
//# sourceMappingURL=canonical-intake-analysis.d.ts.map