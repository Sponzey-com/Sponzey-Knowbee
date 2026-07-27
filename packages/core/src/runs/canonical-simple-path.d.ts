import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js";
export interface CanonicalSimplePathReleaseDescriptor {
    runId: string;
    workId: string;
    classificationFingerprint: `sha256:${string}`;
    answerSource: "llm_generated";
    requestFingerprint: `sha256:${string}`;
    answerFingerprint: `sha256:${string}`;
}
export declare function buildCanonicalSimplePathReleaseDescriptor(input: {
    runId: string;
    classification: unknown;
    answerSource: "llm_generated";
    requestText: string;
    answerText: string;
}): CanonicalSimplePathReleaseDescriptor;
export declare function releaseCanonicalSimplePath(descriptor: CanonicalSimplePathReleaseDescriptor, dependencies: {
    loadAggregate: (workId: string) => CanonicalWorkAggregate | undefined;
    deleteUnstartedAggregate: (workId: string) => boolean;
}): {
    ok: true;
} | {
    ok: false;
    reasonCode: string;
};
//# sourceMappingURL=canonical-simple-path.d.ts.map