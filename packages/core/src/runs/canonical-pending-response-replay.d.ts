import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js";
import type { CanonicalPendingResponse } from "../contracts/canonical-pending-response.js";
import { type CanonicalFinalizationTransitionDescriptor } from "./canonical-finalization-lifecycle.js";
import type { FinalDeliveryCommitResult } from "./channel-finalizer.js";
export interface CanonicalPendingResponseReplayResult {
    runId: string;
    status: "recovered" | "skipped" | "failed";
    reasonCode: string;
}
export declare function replayCanonicalPendingResponses(dependencies: {
    listPending: () => CanonicalPendingResponse[];
    loadAggregate: (workId: string) => CanonicalWorkAggregate | undefined;
    findCommittedDelivery: (item: CanonicalPendingResponse) => FinalDeliveryCommitResult | undefined;
    commitDelivery: (item: CanonicalPendingResponse) => Promise<FinalDeliveryCommitResult>;
    recordCanonicalDelivery: (descriptor: CanonicalFinalizationTransitionDescriptor) => Promise<{
        ok: true;
    } | {
        ok: false;
        reasonCode: string;
    }>;
    consume: (runId: string) => {
        consumed: true;
    } | {
        consumed: false;
        reasonCode: string;
    };
}): Promise<CanonicalPendingResponseReplayResult[]>;
//# sourceMappingURL=canonical-pending-response-replay.d.ts.map